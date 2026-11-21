mod updates;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_cli::CliExt;
use tauri_plugin_fs::FsExt;
use updates::{
    check_for_update, exit_application, install_update, restart_application, UpdateState,
};

#[derive(Default)]
struct FileGrants {
    readable: Mutex<std::collections::VecDeque<PathBuf>>,
    writable: Mutex<std::collections::HashSet<PathBuf>>,
}

fn grant_path(path: &Path) -> std::io::Result<PathBuf> {
    match path.canonicalize() {
        Ok(path) => Ok(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && !path.is_symlink() => {
            let parent = path.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
            Ok(parent
                .canonicalize()?
                .join(path.file_name().ok_or(std::io::ErrorKind::InvalidInput)?))
        }
        Err(error) => Err(error),
    }
}

fn require_selected(app: &AppHandle, path: &str) -> Result<(), String> {
    let canonical = grant_path(Path::new(path)).map_err(|e| e.to_string())?;
    let grants = app.state::<std::sync::Arc<FileGrants>>();
    if grants
        .readable
        .lock()
        .map_err(|e| e.to_string())?
        .contains(&canonical)
    {
        return Ok(());
    }
    Err("Datei nicht freigegeben. Bitte über den Dateidialog öffnen.".into())
}

fn require_save_target(app: &AppHandle, path: &str) -> Result<(), String> {
    let canonical = grant_path(Path::new(path)).map_err(|e| e.to_string())?;
    if app
        .state::<std::sync::Arc<FileGrants>>()
        .writable
        .lock()
        .map_err(|e| e.to_string())?
        .contains(&canonical)
    {
        return Ok(());
    }
    Err("Bitte das Ziel im Speicherdialog auswählen.".into())
}

fn restore_file_grants(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let directory = app.path().app_config_dir()?;
    fs::create_dir_all(&directory)?;
    let record = directory.join("selected-files.grants");
    let mut paths: std::collections::VecDeque<PathBuf> = fs::read(&record)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    paths.retain(|path| {
        is_supported_file(path) && path.is_file() && path.canonicalize().ok().as_ref() == Some(path)
    });
    let grants = std::sync::Arc::new(FileGrants {
        readable: Mutex::new(paths),
        ..Default::default()
    });
    app.manage(grants.clone());
    app.fs_scope().listen(move |event| {
        if let tauri::scope::fs::Event::PathAllowed(path) = event {
            if path.is_dir() || !is_supported_file(path) {
                return;
            }
            if let (Ok(path), Ok(mut paths)) = (grant_path(path), grants.readable.lock()) {
                paths.retain(|old| old != &path);
                paths.push_front(path);
                let saved = (|| -> Result<(), Box<dyn std::error::Error>> {
                    let mut staged = tempfile::NamedTempFile::new_in(&directory)?;
                    serde_json::to_writer(
                        &mut staged,
                        &paths.iter().take(256).collect::<Vec<_>>(),
                    )?;
                    staged.persist(&record)?;
                    Ok(())
                })();
                if let Err(error) = saved {
                    log::warn!("Dateifreigaben: {error}");
                }
            }
        }
    });
    Ok(())
}

#[derive(Deserialize)]
struct SaveFilter {
    name: String,
    extensions: Vec<String>,
}

#[tauri::command]
async fn choose_save_path(
    app: AppHandle,
    default_path: String,
    filters: Vec<SaveFilter>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file_name = Path::new(&default_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("data.json");
    let mut dialog = app.dialog().file().set_file_name(file_name);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    for filter in filters {
        let extensions: Vec<_> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(filter.name, &extensions);
    }
    let Some(file) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    ensure_export_file(&path)?;
    let canonical = grant_path(&path).map_err(|e| e.to_string())?;
    app.state::<std::sync::Arc<FileGrants>>()
        .writable
        .lock()
        .map_err(|e| e.to_string())?
        .insert(canonical);
    app.fs_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

fn ensure_export_file(path: &Path) -> Result<(), String> {
    if path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("csv"))
    {
        return Ok(());
    }
    ensure_supported_file(path, "geschrieben")
}

#[tauri::command]
fn write_export_text(app: AppHandle, path: String, content: String) -> Result<(), String> {
    use std::io::Write;
    require_save_target(&app, &path)?;
    let path = Path::new(&path);
    ensure_export_file(path)?;
    let mut staged = tempfile::NamedTempFile::new_in(path.parent().ok_or("Ungültiger Dateipfad")?)
        .map_err(|e| e.to_string())?;
    staged
        .write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    commit_staged_file(&staged.into_temp_path(), path)
}

// In-memory store for compact JSON bytes (avoids temp files on disk)
struct CompactStore {
    data: Mutex<Option<Vec<u8>>>,
}

// The frontend explicitly requests the launch path before restoring a session.
// No timer: a large-file load must not race the workspace restore timer.
#[tauri::command]
fn get_startup_file(app: AppHandle) -> Option<String> {
    if let Ok(matches) = app.cli().matches() {
        if let Some(path) = matches.args.get("file").and_then(|arg| arg.value.as_str()) {
            if is_supported_file(Path::new(path)) && Path::new(path).exists() {
                app.fs_scope().allow_file(path).ok()?;
                return Some(path.to_owned());
            }
        }
    }
    let path = std::env::args()
        .skip(1)
        .find(|arg| is_supported_file(Path::new(arg)) && Path::new(arg).exists())?;
    app.fs_scope().allow_file(&path).ok()?;
    Some(path)
}

// Files being written in chunks are staged in the target directory. The
// original is replaced only after every chunk has been written successfully.
struct ChunkedSaveStore {
    files: Mutex<HashMap<PathBuf, PathBuf>>,
}

const MAX_READ_CHUNK_SIZE: u64 = 64 * 1024 * 1024;

fn is_supported_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("json")
                || extension.eq_ignore_ascii_case("txt")
                || extension.eq_ignore_ascii_case("geojson")
                || extension.eq_ignore_ascii_case("jsonl")
                || extension.eq_ignore_ascii_case("ndjson")
        })
}

fn ensure_supported_file(path: &Path, action: &str) -> Result<(), String> {
    if is_supported_file(path) {
        Ok(())
    } else {
        Err(format!("Nur JSON/TXT-Dateien können {} werden", action))
    }
}

// Masked export must never replace an open source, including symlinks/hard links.
#[tauri::command]
fn validate_export_path(app: AppHandle, path: String, sources: Vec<String>) -> Result<(), String> {
    require_save_target(&app, &path)?;
    let sources = sources
        .into_iter()
        .filter(|s| require_selected(&app, s).is_ok())
        .collect();
    check_export_path(path, sources)
}

fn check_export_path(path: String, sources: Vec<String>) -> Result<(), String> {
    let target = Path::new(&path);
    ensure_export_file(target)?;
    for source in sources {
        let source = Path::new(&source);
        if target == source
            || (target.exists()
                && source.exists()
                && same_file::is_same_file(target, source).map_err(|e| e.to_string())?)
        {
            return Err("Bitte einen anderen Dateinamen wählen. Die Quelldatei bleibt unverändert. / Choose a different filename; the source is protected.".into());
        }
    }
    Ok(())
}

// Optimized fast file reading command
#[tauri::command]
fn read_file_fast(app: AppHandle, path: String) -> Result<String, String> {
    require_selected(&app, &path)?;
    // Validate file path: only allow JSON/TXT files
    ensure_supported_file(Path::new(&path), "gelesen")?;

    let metadata =
        fs::metadata(&path).map_err(|e| format!("Fehler beim Lesen der Metadaten: {}", e))?;
    let file_size = metadata.len() as usize;

    // Pre-allocate the string with the known size, then read in one pass
    let mut contents = String::with_capacity(file_size);
    let file = fs::File::open(&path).map_err(|e| format!("Fehler beim Öffnen: {}", e))?;

    use std::io::BufReader;
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, file); // 8 MB buffer
    reader
        .read_to_string(&mut contents)
        .map_err(|e| format!("Fehler beim Lesen: {}", e))?;

    Ok(contents)
}

// Fast file reading that returns raw bytes (avoids JSON string escaping in IPC)
// For a 500MB file, this saves ~200MB+ of IPC overhead
#[tauri::command]
fn read_file_raw(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    require_selected(&app, &path)?;
    ensure_supported_file(Path::new(&path), "gelesen")?;

    let bytes = fs::read(&path).map_err(|e| format!("Fehler beim Lesen: {}", e))?;

    Ok(tauri::ipc::Response::new(bytes))
}

// Chunked file reading: reads a byte range and returns raw bytes
// For very large files (>200MB) where a single IPC transfer would hang
#[tauri::command]
fn read_file_chunk(
    app: AppHandle,
    path: String,
    offset: u64,
    length: u64,
) -> Result<tauri::ipc::Response, String> {
    require_selected(&app, &path)?;
    use std::io::{Seek, SeekFrom};

    ensure_supported_file(Path::new(&path), "gelesen")?;

    if length > MAX_READ_CHUNK_SIZE {
        return Err(format!(
            "Ein Lese-Chunk darf höchstens {} MB groß sein",
            MAX_READ_CHUNK_SIZE / 1024 / 1024
        ));
    }

    let file_size = fs::metadata(&path)
        .map_err(|e| format!("Fehler beim Lesen der Metadaten: {}", e))?
        .len();
    if offset > file_size {
        return Err("Der Lese-Offset liegt hinter dem Dateiende".to_string());
    }
    let length = length.min(file_size - offset);

    let mut file = fs::File::open(&path).map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Fehler beim Seek: {}", e))?;

    let capacity = usize::try_from(length).map_err(|_| "Ungültige Chunk-Größe".to_string())?;
    let mut buffer = Vec::with_capacity(capacity);
    file.take(length)
        .read_to_end(&mut buffer)
        .map_err(|e| format!("Fehler beim Lesen: {}", e))?;

    Ok(tauri::ipc::Response::new(buffer))
}

// Start an atomic chunked save in a temporary sibling file.
#[tauri::command]
fn save_file_start(
    app: AppHandle,
    path: String,
    store: tauri::State<'_, ChunkedSaveStore>,
) -> Result<(), String> {
    require_save_target(&app, &path)?;
    let target = PathBuf::from(path);
    ensure_export_file(&target)?;

    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let (_, temporary) = tempfile::NamedTempFile::new_in(parent)
        .and_then(|file| file.keep().map_err(std::io::Error::from))
        .map_err(|e| e.to_string())?;

    let mut files = store
        .files
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?;
    if let Some(previous) = files.insert(target, temporary) {
        let _ = fs::remove_file(previous);
    }
    Ok(())
}

// Append a string chunk to the staged file, with optional LF→CRLF conversion.
#[tauri::command]
fn save_file_chunk(
    app: AppHandle,
    path: String,
    content: String,
    crlf: Option<bool>,
    store: tauri::State<'_, ChunkedSaveStore>,
) -> Result<(), String> {
    require_save_target(&app, &path)?;
    use std::io::Write;
    let target = PathBuf::from(path);
    ensure_export_file(&target)?;
    let temporary = store
        .files
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?
        .get(&target)
        .cloned()
        .ok_or("Kein aktiver Speichervorgang für diese Datei".to_string())?;
    let file = fs::OpenOptions::new()
        .append(true)
        .open(&temporary)
        .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    let mut writer = std::io::BufWriter::with_capacity(64 * 1024, file);

    if crlf.unwrap_or(false) {
        let bytes = content.as_bytes();
        let mut start = 0;
        for i in 0..bytes.len() {
            if bytes[i] == b'\n' {
                writer
                    .write_all(&bytes[start..i])
                    .map_err(|e| format!("Schreibfehler: {}", e))?;
                writer
                    .write_all(b"\r\n")
                    .map_err(|e| format!("Schreibfehler: {}", e))?;
                start = i + 1;
            }
        }
        if start < bytes.len() {
            writer
                .write_all(&bytes[start..])
                .map_err(|e| format!("Schreibfehler: {}", e))?;
        }
    } else {
        writer
            .write_all(content.as_bytes())
            .map_err(|e| format!("Schreibfehler: {}", e))?;
    }
    writer.flush().map_err(|e| format!("Flush-Fehler: {}", e))?;
    Ok(())
}

// Commit a fully written staged file by replacing the target with its sibling.
#[tauri::command]
fn save_file_finish(
    app: AppHandle,
    path: String,
    store: tauri::State<'_, ChunkedSaveStore>,
) -> Result<(), String> {
    require_save_target(&app, &path)?;
    let target = PathBuf::from(path);
    ensure_export_file(&target)?;
    let temporary = store
        .files
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?
        .get(&target)
        .cloned()
        .ok_or("Kein aktiver Speichervorgang für diese Datei".to_string())?;

    commit_staged_file(&temporary, &target)?;
    store
        .files
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?
        .remove(&target);
    Ok(())
}

// An atomic rename replaces the inode, so retain the destination's access policy.
#[cfg(unix)]
fn replace_staged(temporary: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::{chown, MetadataExt};
    match fs::metadata(target) {
        Ok(metadata) => {
            let staged = fs::metadata(temporary)?;
            if staged.uid() != metadata.uid() || staged.gid() != metadata.gid() {
                chown(temporary, Some(metadata.uid()), Some(metadata.gid()))?;
            }
            #[cfg(target_os = "linux")]
            {
                let acl = "system.posix_acl_access";
                match xattr::get_deref(target, acl) {
                    Ok(Some(bytes)) => xattr::set(temporary, acl, &bytes)?,
                    Ok(None) if xattr::get(temporary, acl)?.is_some() => {
                        xattr::remove(temporary, acl)?
                    }
                    Ok(None) => (),
                    Err(error) if error.kind() == std::io::ErrorKind::Unsupported => (),
                    Err(error) => return Err(error),
                }
            }
            #[cfg(target_os = "macos")]
            {
                use std::os::unix::ffi::OsStrExt;
                let source = std::ffi::CString::new(target.as_os_str().as_bytes())?;
                let destination = std::ffi::CString::new(temporary.as_os_str().as_bytes())?;
                // The two C strings live through this synchronous metadata-only call.
                if unsafe {
                    libc::copyfile(
                        source.as_ptr(),
                        destination.as_ptr(),
                        std::ptr::null_mut(),
                        libc::COPYFILE_ACL,
                    )
                } != 0
                {
                    return Err(std::io::Error::last_os_error());
                }
            }
            fs::set_permissions(temporary, metadata.permissions())?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
        Err(error) => return Err(error),
    }
    fs::rename(temporary, target)
}

#[cfg(windows)]
fn replace_staged(temporary: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;
    if !target.try_exists()? {
        return fs::rename(temporary, target);
    }
    let wide = |path: &Path| {
        path.as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>()
    };
    let target = wide(target);
    let temporary = wide(temporary);
    // ReplaceFileW preserves the existing target's discretionary ACL.
    let ok = unsafe {
        ReplaceFileW(
            target.as_ptr(),
            temporary.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null(),
            std::ptr::null(),
        )
    };
    if ok == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

fn commit_staged_file(temporary: &Path, target: &Path) -> Result<(), String> {
    fs::OpenOptions::new()
        .write(true)
        .open(temporary)
        .and_then(|file| file.sync_all())
        .map_err(|e| format!("Temporäre Datei konnte nicht synchronisiert werden: {}", e))?;
    replace_staged(temporary, target)
        .map_err(|e| format!("Temporäre Datei konnte nicht übernommen werden: {}", e))?;
    // Persist the rename itself on Unix by syncing the parent directory.
    #[cfg(unix)]
    if let Some(parent) = target.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(|e| format!("Verzeichnis konnte nicht synchronisiert werden: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod review_tests {
    use super::*;

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let unique = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "json-viewer-test-{}-{}",
                std::process::id(),
                unique
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn masked_export_protects_source_and_hard_links() {
        let dir = TestDirectory::new();
        let source = dir.0.join("source.json");
        let alias = dir.0.join("alias.json");
        fs::write(&source, b"{\"secret\":1}").unwrap();
        fs::hard_link(&source, &alias).unwrap();
        let sources = vec![source.to_string_lossy().into_owned()];
        assert!(check_export_path(source.to_string_lossy().into_owned(), sources.clone()).is_err());
        assert!(check_export_path(alias.to_string_lossy().into_owned(), sources.clone()).is_err());
        assert!(check_export_path(
            dir.0.join("masked.json").to_string_lossy().into_owned(),
            sources
        )
        .is_ok());
        assert_eq!(fs::read_to_string(source).unwrap(), "{\"secret\":1}");
    }

    #[cfg(unix)]
    #[test]
    fn replacement_preserves_private_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TestDirectory::new();
        let target = dir.0.join("private.json");
        let staged = dir.0.join("new.tmp");
        fs::write(&target, b"old").unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();
        fs::write(&staged, b"new").unwrap();
        commit_staged_file(&staged, &target).unwrap();
        assert_eq!(
            fs::metadata(target).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[test]
    fn staged_save_replaces_existing_file() {
        let dir = TestDirectory::new();
        let target = dir.0.join("document.json");
        let temporary = dir.0.join("staged.tmp");
        fs::write(&target, b"old").unwrap();
        fs::write(&temporary, "{\"text\":\"Grüße 🦀\"}").unwrap();
        commit_staged_file(&temporary, &target).unwrap();
        assert_eq!(
            fs::read_to_string(target).unwrap(),
            "{\"text\":\"Grüße 🦀\"}"
        );
        assert!(!temporary.exists());
    }

    #[test]
    fn failed_commit_preserves_original() {
        let dir = TestDirectory::new();
        let target = dir.0.join("document.json");
        fs::write(&target, b"original").unwrap();
        assert!(commit_staged_file(&dir.0.join("missing.tmp"), &target).is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "original");
    }

    #[test]
    fn copy_to_hardlink_keeps_source() {
        let dir = TestDirectory::new();
        let source = dir.0.join("source.json");
        let alias = dir.0.join("alias.json");
        fs::write(&source, b"123").unwrap();
        fs::hard_link(&source, &alias).unwrap();
        copy_document(&source, &alias).unwrap();
        assert_eq!(fs::read(source).unwrap(), b"123");
    }
}

#[tauri::command]
fn save_file_cancel(
    app: AppHandle,
    path: String,
    store: tauri::State<'_, ChunkedSaveStore>,
) -> Result<(), String> {
    require_save_target(&app, &path)?;
    let target = PathBuf::from(path);
    let temporary = store
        .files
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?
        .remove(&target);
    if let Some(temporary) = temporary {
        fs::remove_file(temporary)
            .map_err(|e| format!("Temporäre Datei konnte nicht entfernt werden: {}", e))?;
    }
    Ok(())
}

// Detect JSON formatting from raw bytes: indent string + CRLF flag
fn detect_json_format(bytes: &[u8]) -> (String, bool) {
    let sample_len = bytes.len().min(32768);
    let sample = &bytes[..sample_len];

    // Detect CRLF
    let uses_crlf = sample.windows(2).any(|w| w == b"\r\n");

    // Split into lines and measure indentation of each line
    let newline = if uses_crlf {
        b"\r\n".as_slice()
    } else {
        b"\n".as_slice()
    };
    let mut indent_levels: Vec<usize> = Vec::new();
    let mut uses_tabs = false;

    let mut pos = 0;
    while pos < sample_len {
        // Find end of line
        let line_end = if uses_crlf {
            sample[pos..]
                .windows(2)
                .position(|w| w == b"\r\n")
                .map(|p| pos + p)
                .unwrap_or(sample_len)
        } else {
            sample[pos..]
                .iter()
                .position(|&b| b == b'\n')
                .map(|p| pos + p)
                .unwrap_or(sample_len)
        };

        let line = &sample[pos..line_end];
        if !line.is_empty() {
            let first_char = line[0];
            if first_char == b'\t' {
                uses_tabs = true;
                let count = line.iter().take_while(|&&b| b == b'\t').count();
                indent_levels.push(count);
            } else if first_char == b' ' {
                let count = line.iter().take_while(|&&b| b == b' ').count();
                if count > 0 {
                    indent_levels.push(count);
                }
            }
        }

        pos = line_end + newline.len();
    }

    // Find the base indent unit using GCD of all positive indent diffs.
    // This correctly detects 2-space even when most lines use 4-space increments
    // (e.g. files with mixed indentation or reset patterns).
    let indent = if uses_tabs {
        "\t".to_string()
    } else {
        // Collect all positive differences between consecutive indent levels
        let mut diffs: Vec<usize> = Vec::new();
        for window in indent_levels.windows(2) {
            let diff = window[1].saturating_sub(window[0]);
            if diff > 0 && diff <= 16 {
                diffs.push(diff);
            }
        }

        if diffs.is_empty() {
            // Fallback: find the smallest non-zero indent level
            let min_indent = indent_levels
                .iter()
                .copied()
                .filter(|&x| x > 0)
                .min()
                .unwrap_or(2);
            " ".repeat(min_indent)
        } else {
            // Compute GCD of all observed diffs — this finds the true base unit
            fn gcd(a: usize, b: usize) -> usize {
                if b == 0 {
                    a
                } else {
                    gcd(b, a % b)
                }
            }
            let base = diffs.iter().copied().fold(0usize, gcd);
            let base = if base == 0 { 2 } else { base };
            " ".repeat(base)
        }
    };

    (indent, uses_crlf)
}

// Helper: serialize JSON with custom indent into a writer
// Copy a file byte-for-byte (for saving unmodified files 1:1)
#[tauri::command]
fn copy_file(app: AppHandle, source: String, dest: String) -> Result<(), String> {
    require_selected(&app, &source)?;
    require_save_target(&app, &dest)?;
    ensure_supported_file(Path::new(&source), "gelesen")?;
    ensure_supported_file(Path::new(&dest), "geschrieben")?;
    // If source == dest, nothing to do (file is already there)
    copy_document(Path::new(&source), Path::new(&dest))
}

fn copy_document(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() && same_file::is_same_file(source, target).map_err(|e| e.to_string())? {
        return Ok(());
    }
    let parent = target.parent().unwrap_or(Path::new("."));
    let mut staged = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    let mut input = fs::File::open(source).map_err(|e| e.to_string())?;
    std::io::copy(&mut input, &mut staged).map_err(|e| e.to_string())?;
    commit_staged_file(&staged.into_temp_path(), target)
}

// Parse JSON file in Rust (serde_json, ~5x faster than V8 JSON.parse)
// Stores compact JSON in memory for direct IPC transfer (no temp files)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CompactResult {
    compact_size: u64,
    original_size: u64,
    node_count: u64,
    was_concatenated: bool,
    indent: String,
    uses_crlf: bool,
}

fn compact_document(bytes: &[u8], is_ndjson: bool) -> Result<(Vec<u8>, bool), String> {
    let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    let mut compact_bytes = vec![b'['];
    let mut count = 0;
    let mut append = |raw: &serde_json::value::RawValue| {
        if count > 0 {
            compact_bytes.push(b',');
        }
        count += 1;
        let mut quoted = false;
        let mut escaped = false;
        for byte in raw.get().bytes() {
            if quoted || !byte.is_ascii_whitespace() {
                compact_bytes.push(byte);
            }
            if escaped {
                escaped = false;
            } else if quoted && byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                quoted = !quoted;
            }
        }
    };
    if is_ndjson {
        for (index, line) in text.lines().enumerate() {
            if !line.trim().is_empty() {
                append(
                    serde_json::from_str(line)
                        .map_err(|e| format!("Ungültige JSON-Zeile {}: {e}", index + 1))?,
                );
            }
        }
    } else {
        for raw in
            serde_json::Deserializer::from_str(text).into_iter::<&serde_json::value::RawValue>()
        {
            append(raw.map_err(|e| e.to_string())?);
        }
    }
    if count == 0 {
        return Err("Datei enthält keine Datensätze".into());
    }
    let was_concatenated = !is_ndjson && count > 1;
    if is_ndjson || was_concatenated {
        compact_bytes.push(b']');
    } else {
        compact_bytes.remove(0);
    }
    Ok((compact_bytes, was_concatenated))
}

#[tauri::command]
fn parse_json_compact(
    app: AppHandle,
    path: String,
    store: tauri::State<'_, CompactStore>,
) -> Result<CompactResult, String> {
    require_selected(&app, &path)?;
    ensure_supported_file(Path::new(&path), "gelesen")?;

    let original_size = fs::metadata(&path)
        .map_err(|e| format!("Metadaten-Fehler: {}", e))?
        .len();

    // Read raw bytes
    let mut bytes = fs::read(&path).map_err(|e| format!("Fehler beim Lesen: {}", e))?;

    // Strip UTF-8 BOM if present
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        bytes = bytes[3..].to_vec();
    }

    // Detect original formatting (indent style + line endings) BEFORE parsing
    let (indent, uses_crlf) = detect_json_format(&bytes);

    // Parse with serde_json (streaming, fast, memory-efficient)
    // NDJSON/JSONL: one value per non-blank line, wrapped into an array root
    let is_ndjson = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("jsonl") || e.eq_ignore_ascii_case("ndjson"));
    let (compact_bytes, was_concatenated) = compact_document(&bytes, is_ndjson)?;
    let compact_size = compact_bytes.len() as u64;
    let node_count = 0;
    drop(bytes);

    // Store compact bytes in memory for retrieval via get_compact_bytes
    *store
        .data
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))? = Some(compact_bytes);

    Ok(CompactResult {
        compact_size,
        original_size,
        node_count,
        was_concatenated,
        indent,
        uses_crlf,
    })
}

// Retrieve compact JSON bytes from memory (stored by parse_json_compact)
// Returns raw bytes via efficient IPC (avoids JSON string escaping overhead)
#[tauri::command]
fn get_compact_bytes(
    store: tauri::State<'_, CompactStore>,
) -> Result<tauri::ipc::Response, String> {
    let data = store
        .data
        .lock()
        .map_err(|e| format!("Lock-Fehler: {}", e))?
        .take()
        .ok_or("Keine kompakten Daten vorhanden".to_string())?;
    Ok(tauri::ipc::Response::new(data))
}

// Get file statistics: exact byte size and accurate JSON node count (Rust-side)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileStats {
    size_bytes: u64,
    node_count: u64,
}

fn count_json_value(val: &serde_json::Value) -> u64 {
    // Iterative counting to handle arbitrarily deep/large structures
    let mut count: u64 = 0;
    let mut stack: Vec<&serde_json::Value> = vec![val];
    while let Some(v) = stack.pop() {
        count += 1;
        match v {
            serde_json::Value::Array(arr) => {
                for item in arr {
                    stack.push(item);
                }
            }
            serde_json::Value::Object(map) => {
                for (_k, item) in map {
                    stack.push(item);
                }
            }
            _ => {}
        }
    }
    count
}

// Get file size only (without re-reading and re-parsing the file)
#[tauri::command]
fn get_file_size(app: AppHandle, path: String) -> Result<u64, String> {
    require_selected(&app, &path)?;
    ensure_supported_file(Path::new(&path), "gelesen")?;
    let metadata = fs::metadata(&path).map_err(|e| format!("Fehler Metadaten: {}", e))?;
    Ok(metadata.len())
}

#[tauri::command]
fn get_file_stats(app: AppHandle, path: String) -> Result<FileStats, String> {
    require_selected(&app, &path)?;
    ensure_supported_file(Path::new(&path), "gelesen")?;

    let metadata = fs::metadata(&path).map_err(|e| format!("Fehler Metadaten: {}", e))?;
    let size_bytes = metadata.len();

    // For files > 50 MB, only return size (avoid re-reading and re-parsing)
    if size_bytes > 50 * 1024 * 1024 {
        return Ok(FileStats {
            size_bytes,
            node_count: 0,
        });
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Fehler beim Lesen: {}", e))?;

    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("JSON-Parse-Fehler: {}", e))?;

    let node_count = count_json_value(&parsed);

    Ok(FileStats {
        size_bytes,
        node_count,
    })
}

// Window state persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

fn get_window_state_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let app_data = std::env::var("APPDATA")
            .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
        PathBuf::from(app_data)
            .join("com.jsonviewer.app")
            .join("window_state.json")
    }

    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME")
            .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
        PathBuf::from(home)
            .join("Library/Application Support/com.jsonviewer.app")
            .join("window_state.json")
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let home = std::env::var("HOME")
            .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
        PathBuf::from(home)
            .join(".config/com.jsonviewer.app")
            .join("window_state.json")
    }
}

#[tauri::command]
fn get_window_state() -> Option<WindowState> {
    let path = get_window_state_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(state) = serde_json::from_str::<WindowState>(&content) {
                return Some(state);
            }
        }
    }
    None
}

#[tauri::command]
fn save_window_state(width: u32, height: u32, _x: i32, _y: i32) -> Result<(), String> {
    let path = get_window_state_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    // Only save size, not position to avoid off-screen issues
    let state = WindowState {
        width,
        height,
        x: 0, // Don't save position
        y: 0, // Don't save position
    };
    let content = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

// Set menu language
#[tauri::command]
fn set_menu_language(app: AppHandle, lang: String) -> Result<(), String> {
    build_menu(&app, &lang).map_err(|e| e.to_string())
}

fn json_viewer_about_metadata(is_en: bool) -> AboutMetadata<'static> {
    AboutMetadata {
        name: Some("JSON Viewer/Editor".to_string()),
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        copyright: Some("© 2026 Norbert Jander · MIT License".to_string()),
        authors: Some(vec!["Norbert Jander".to_string()]),
        license: Some("MIT License".to_string()),
        website: Some("https://github.com/nojan01/json-viewer-editor".to_string()),
        website_label: Some("GitHub".to_string()),
        credits: Some("Licensed under the MIT License".to_string()),
        comments: Some(if is_en {
            "A powerful JSON viewer and editor".to_string()
        } else {
            "Ein leistungsstarker JSON Viewer und Editor".to_string()
        }),
        ..Default::default()
    }
}

fn build_menu(app_handle: &AppHandle, lang: &str) -> Result<(), Box<dyn std::error::Error>> {
    let is_en = lang == "en";

    // App menu (macOS-specific)
    #[cfg(target_os = "macos")]
    let app_menu = {
        let about = PredefinedMenuItem::about(
            app_handle,
            Some(if is_en {
                "About JSON Viewer"
            } else {
                "Über JSON Viewer"
            }),
            Some(json_viewer_about_metadata(is_en)),
        )?;
        let separator = PredefinedMenuItem::separator(app_handle)?;
        let hide = PredefinedMenuItem::hide(
            app_handle,
            Some(if is_en {
                "Hide JSON Viewer"
            } else {
                "JSON Viewer ausblenden"
            }),
        )?;
        let hide_others = PredefinedMenuItem::hide_others(
            app_handle,
            Some(if is_en {
                "Hide Others"
            } else {
                "Andere ausblenden"
            }),
        )?;
        let show_all = PredefinedMenuItem::show_all(
            app_handle,
            Some(if is_en { "Show All" } else { "Alle einblenden" }),
        )?;
        let quit = PredefinedMenuItem::quit(
            app_handle,
            Some(if is_en {
                "Quit JSON Viewer"
            } else {
                "JSON Viewer beenden"
            }),
        )?;

        Submenu::with_items(
            app_handle,
            "JSON Viewer",
            true,
            &[
                &about,
                &separator,
                &hide,
                &hide_others,
                &show_all,
                &PredefinedMenuItem::separator(app_handle)?,
                &quit,
            ],
        )?
    };

    // File menu
    let open_item = MenuItem::with_id(
        app_handle,
        "open",
        if is_en { "Open..." } else { "Öffnen..." },
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let save_item = MenuItem::with_id(
        app_handle,
        "save",
        if is_en { "Save" } else { "Speichern" },
        true,
        Some("CmdOrCtrl+S"),
    )?;
    let close = MenuItem::with_id(
        app_handle,
        "close_tab",
        if is_en { "Close Tab" } else { "Tab schließen" },
        true,
        Some("CmdOrCtrl+W"),
    )?;

    let file_menu = Submenu::with_items(
        app_handle,
        if is_en { "File" } else { "Datei" },
        true,
        &[
            &open_item,
            &save_item,
            &PredefinedMenuItem::separator(app_handle)?,
            &close,
        ],
    )?;

    // Edit menu
    let undo = MenuItem::with_id(
        app_handle,
        "undo",
        if is_en { "Undo" } else { "Rückgängig" },
        true,
        Some("CmdOrCtrl+Z"),
    )?;
    let redo = MenuItem::with_id(
        app_handle,
        "redo",
        if is_en { "Redo" } else { "Wiederholen" },
        true,
        Some("CmdOrCtrl+Shift+Z"),
    )?;
    let cut = MenuItem::with_id(
        app_handle,
        "cut",
        if is_en { "Cut" } else { "Ausschneiden" },
        true,
        Some("CmdOrCtrl+X"),
    )?;
    let copy = MenuItem::with_id(
        app_handle,
        "copy",
        if is_en { "Copy" } else { "Kopieren" },
        true,
        Some("CmdOrCtrl+C"),
    )?;
    let paste = MenuItem::with_id(
        app_handle,
        "paste",
        if is_en { "Paste" } else { "Einsetzen" },
        true,
        Some("CmdOrCtrl+V"),
    )?;
    let select_all = MenuItem::with_id(
        app_handle,
        "select_all",
        if is_en {
            "Select All"
        } else {
            "Alles auswählen"
        },
        true,
        Some("CmdOrCtrl+A"),
    )?;

    let edit_menu = Submenu::with_id_and_items(
        app_handle,
        "edit_menu_custom",
        if is_en { "Edit" } else { "Bearbeiten" },
        true,
        &[
            &undo,
            &redo,
            &PredefinedMenuItem::separator(app_handle)?,
            &cut,
            &copy,
            &paste,
            &PredefinedMenuItem::separator(app_handle)?,
            &select_all,
        ],
    )?;

    // View menu
    let expand_all = MenuItem::with_id(
        app_handle,
        "expand_all",
        if is_en {
            "Expand All"
        } else {
            "Alle aufklappen"
        },
        true,
        Some("CmdOrCtrl+E"),
    )?;
    let collapse_all = MenuItem::with_id(
        app_handle,
        "collapse_all",
        if is_en {
            "Collapse All"
        } else {
            "Alle zuklappen"
        },
        true,
        None::<&str>,
    )?;
    let goto_line = MenuItem::with_id(
        app_handle,
        "goto_line",
        if is_en {
            "Go to Line..."
        } else {
            "Gehe zu Zeile..."
        },
        true,
        Some("CmdOrCtrl+Shift+L"),
    )?;

    #[cfg(target_os = "macos")]
    let fullscreen = PredefinedMenuItem::fullscreen(
        app_handle,
        Some(if is_en { "Fullscreen" } else { "Vollbild" }),
    )?;

    // Theme submenu
    let theme_dark = MenuItem::with_id(
        app_handle,
        "theme_dark",
        if is_en { "Dark" } else { "Dunkel" },
        true,
        None::<&str>,
    )?;
    let theme_light = MenuItem::with_id(
        app_handle,
        "theme_light",
        if is_en { "Light" } else { "Hell" },
        true,
        None::<&str>,
    )?;
    let theme_menu = Submenu::with_items(
        app_handle,
        if is_en { "Theme" } else { "Design" },
        true,
        &[&theme_dark, &theme_light],
    )?;

    // Language submenu
    let lang_de = MenuItem::with_id(app_handle, "lang_de", "Deutsch", true, None::<&str>)?;
    let lang_en = MenuItem::with_id(app_handle, "lang_en", "English", true, None::<&str>)?;
    let lang_menu = Submenu::with_items(
        app_handle,
        if is_en { "Language" } else { "Sprache" },
        true,
        &[&lang_de, &lang_en],
    )?;

    #[cfg(target_os = "macos")]
    let view_menu = Submenu::with_items(
        app_handle,
        if is_en { "View" } else { "Darstellung" },
        true,
        &[
            &expand_all,
            &collapse_all,
            &PredefinedMenuItem::separator(app_handle)?,
            &goto_line,
            &PredefinedMenuItem::separator(app_handle)?,
            &theme_menu,
            &lang_menu,
            &PredefinedMenuItem::separator(app_handle)?,
            &fullscreen,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let view_menu = Submenu::with_items(
        app_handle,
        if is_en { "View" } else { "Ansicht" },
        true,
        &[
            &expand_all,
            &collapse_all,
            &PredefinedMenuItem::separator(app_handle)?,
            &goto_line,
            &PredefinedMenuItem::separator(app_handle)?,
            &theme_menu,
            &lang_menu,
        ],
    )?;

    // Window menu
    // Use application-owned items instead of the predefined minimize role.
    // The predefined role is not rendered as an actionable menu entry by all
    // Linux GTK menu backends, leaving this submenu empty.
    let minimize = MenuItem::with_id(
        app_handle,
        "minimize",
        if is_en { "Minimize" } else { "Minimieren" },
        true,
        Some("CmdOrCtrl+M"),
    )?;

    let window_menu = Submenu::with_items(
        app_handle,
        if is_en { "Window" } else { "Fenster" },
        true,
        &[&minimize],
    )?;

    let check_updates = MenuItem::with_id(
        app_handle,
        "check_updates",
        if is_en {
            "Check for Updates…"
        } else {
            "Nach Updates suchen…"
        },
        true,
        None::<&str>,
    )?;

    // Help menu
    let help_item = MenuItem::with_id(
        app_handle,
        "show_help",
        if is_en {
            "JSON Viewer Help"
        } else {
            "JSON Viewer Hilfe"
        },
        true,
        Some("F1"),
    )?;

    #[cfg(target_os = "macos")]
    let help_menu = Submenu::with_items(
        app_handle,
        if is_en { "Help" } else { "Hilfe" },
        true,
        &[&help_item, &check_updates],
    )?;

    #[cfg(not(target_os = "macos"))]
    let help_menu = {
        let about_item = PredefinedMenuItem::about(
            app_handle,
            Some(if is_en {
                "About JSON Viewer"
            } else {
                "Über JSON Viewer"
            }),
            Some(json_viewer_about_metadata(is_en)),
        )?;
        Submenu::with_items(
            app_handle,
            if is_en { "Help" } else { "Hilfe" },
            true,
            &[
                &help_item,
                &check_updates,
                &PredefinedMenuItem::separator(app_handle)?,
                &about_item,
            ],
        )?
    };

    // Build menu - macOS has app menu, Windows/Linux don't
    #[cfg(target_os = "macos")]
    let menu = Menu::with_items(
        app_handle,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let menu = Menu::with_items(
        app_handle,
        &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )?;

    app_handle.set_menu(menu)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // On Windows, increase WebView2's V8 heap limit for large JSON files
    // Default V8 heap is ~1.7GB which isn't enough for 500MB+ files
    #[cfg(target_os = "windows")]
    {
        // SAFETY: Called before any threads are spawned (main entry point)
        // Only set --max-old-space-size; do NOT use --disable-features as it can
        // break WebView2 under certain Windows security policies
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--js-flags=--max-old-space-size=8192",
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(UpdateState::default())
        .manage(CompactStore {
            data: Mutex::new(None),
        })
        .manage(ChunkedSaveStore {
            files: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_startup_file,
            choose_save_path,
            write_export_text,
            check_for_update,
            install_update,
            restart_application,
            exit_application,
            validate_export_path,
            read_file_fast,
            read_file_raw,
            read_file_chunk,
            copy_file,
            save_file_start,
            save_file_chunk,
            save_file_finish,
            save_file_cancel,
            parse_json_compact,
            get_compact_bytes,
            get_file_stats,
            get_file_size,
            set_menu_language,
            get_window_state,
            save_window_state
        ])
        .setup(|app| {
            let app_handle = app.handle();
            restore_file_grants(app_handle)?;

            // Restore window state from saved settings
            if let Some(window) = app.get_webview_window("main") {
                // First, make sure the window is visible and centered
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();

                // Only restore size, not position to avoid off-screen issues
                if let Some(state) = get_window_state() {
                    if state.width >= 800 && state.height >= 600 {
                        let _ = window.set_size(tauri::LogicalSize::new(
                            state.width as f64,
                            state.height as f64,
                        ));
                    }
                    // Center the window instead of using saved position
                    let _ = window.center();
                } else {
                    // If no saved state, ensure window is centered
                    let _ = window.center();
                }
            }

            // CLI / Explorer launch paths are requested by get_startup_file.

            // Build initial menu in German
            build_menu(app_handle, "de")?;

            // Handle menu events
            app.on_menu_event(move |app, event| {
                let id = event.id().as_ref();
                if let Some(window) = app.get_webview_window("main") {
                    match id {
                        "open" => {
                            let _ = window.eval("openFile()");
                        }
                        "save" => {
                            let _ = window.eval("saveFile()");
                        }
                        "close_tab" => {
                            let _ = window.eval("closeDocument(activeDocumentId)");
                        }
                        "check_updates" => {
                            let _ = window.eval("checkForUpdates(true)");
                        }
                        "expand_all" => {
                            let _ = window.eval("expandAll()");
                        }
                        "collapse_all" => {
                            let _ = window.eval("collapseAll()");
                        }
                        "goto_line" => {
                            let _ = window.eval("showGotoLineDialog()");
                        }
                        "show_help" => {
                            let _ = window.eval("showHelp()");
                        }
                        "minimize" => {
                            let _ = window.minimize();
                        }
                        // Edit menu handlers
                        "undo" => {
                            let _ = window.eval("nativeUndo(false)");
                        }
                        "redo" => {
                            let _ = window.eval("nativeUndo(true)");
                        }
                        "cut" => {
                            let _ = window.eval("document.execCommand('cut')");
                        }
                        "copy" => {
                            let _ = window.eval("document.execCommand('copy')");
                        }
                        "paste" => {
                            let _ = window.eval("document.execCommand('paste')");
                        }
                        "select_all" => {
                            let _ = window.eval("document.execCommand('selectAll')");
                        }
                        // Theme handlers
                        "theme_dark" => {
                            let _ = window.eval("setTheme('dark')");
                        }
                        "theme_light" => {
                            let _ = window.eval("setTheme('light')");
                        }
                        // Language handlers
                        "lang_de" => {
                            let _ = window.eval("setLanguage('de')");
                        }
                        "lang_en" => {
                            let _ = window.eval("setLanguage('en')");
                        }
                        _ => {}
                    }
                }
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Handle file drop events (drag & drop from File Explorer)
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                for path in paths {
                    if is_supported_file(path)
                        && path.is_file()
                        && window.fs_scope().allow_file(path).is_ok()
                    {
                        let path_str = path.to_string_lossy().to_string();
                        let _ = window.emit("open-file", &path_str);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("error while building tauri application: {e}");
            std::process::exit(1);
        })
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = &event
            {
                api.prevent_exit();
                let _ = _app_handle.emit("request-app-exit", ());
            }
            // On macOS, file associations (double-click in Finder, "Open With…") are
            // delivered via Apple Events, surfaced by Tauri as RunEvent::Opened { urls }.
            // CLI/env args are NOT populated in this case, so we must handle it here.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                for url in urls {
                    // Tauri delivers a file:// URL; convert to a local path.
                    let path_opt = url.to_file_path().ok();
                    if let Some(path) = path_opt {
                        let path_str = path.to_string_lossy().to_string();
                        if is_supported_file(&path)
                            && path.is_file()
                            && _app_handle.fs_scope().allow_file(&path).is_ok()
                        {
                            let app_handle_clone = _app_handle.clone();
                            // Delay slightly so the frontend listener is ready when the app
                            // is being launched cold by the OS via this event.
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(800));
                                let _ = app_handle_clone.emit("open-file", &path_str);
                            });
                        }
                    }
                }
            }

            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Application exit event
            }
        });
}

#[cfg(test)]
mod ndjson_tests {
    use super::compact_document;

    #[test]
    fn compaction_preserves_exact_numeric_tokens() {
        let (bytes, multiple) =
            compact_document(br#"{ "id": 9007199254740993, "n": 1e400 }"#, false).unwrap();
        assert!(!multiple);
        assert_eq!(bytes, br#"{"id":9007199254740993,"n":1e400}"#);
    }

    #[test]
    fn parses_lines_into_array_and_skips_blank_lines() {
        let (v, _) = compact_document(b"{\"a\":1}\r\n\n[2]\n", true).unwrap();
        assert_eq!(v, br#"[{"a":1},[2]]"#);
    }

    #[test]
    fn reports_bad_line_number() {
        let err = compact_document(b"{}\n{bad\n", true).unwrap_err();
        assert!(err.starts_with("Ungültige JSON-Zeile 2"));
    }

    #[test]
    fn rejects_empty_input() {
        assert!(compact_document(b"\n  \n", true).is_err());
    }
}
