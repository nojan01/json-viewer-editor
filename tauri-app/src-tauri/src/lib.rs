use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem};
#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
use tauri::{Manager, AppHandle, Emitter};
use tauri_plugin_cli::CliExt;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::io::Read;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

// In-memory store for compact JSON bytes (avoids temp files on disk)
struct CompactStore {
    data: Mutex<Option<Vec<u8>>>,
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
        })
}

fn ensure_supported_file(path: &Path, action: &str) -> Result<(), String> {
    if is_supported_file(path) {
        Ok(())
    } else {
        Err(format!("Nur JSON/TXT-Dateien können {} werden", action))
    }
}

// Optimized fast file reading command
#[tauri::command]
fn read_file_fast(path: String) -> Result<String, String> {
    // Validate file path: only allow JSON/TXT files
    ensure_supported_file(Path::new(&path), "gelesen")?;
    
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Fehler beim Lesen der Metadaten: {}", e))?;
    let file_size = metadata.len() as usize;
    
    // Pre-allocate the string with the known size, then read in one pass
    let mut contents = String::with_capacity(file_size);
    let file = fs::File::open(&path)
        .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    
    use std::io::BufReader;
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, file); // 8 MB buffer
    reader.read_to_string(&mut contents)
        .map_err(|e| format!("Fehler beim Lesen: {}", e))?;
    
    Ok(contents)
}

// Fast file reading that returns raw bytes (avoids JSON string escaping in IPC)
// For a 500MB file, this saves ~200MB+ of IPC overhead
#[tauri::command]
fn read_file_raw(path: String) -> Result<tauri::ipc::Response, String> {
    ensure_supported_file(Path::new(&path), "gelesen")?;
    
    let bytes = fs::read(&path)
        .map_err(|e| format!("Fehler beim Lesen: {}", e))?;
    
    Ok(tauri::ipc::Response::new(bytes))
}

// Chunked file reading: reads a byte range and returns raw bytes
// For very large files (>200MB) where a single IPC transfer would hang
#[tauri::command]
fn read_file_chunk(path: String, offset: u64, length: u64) -> Result<tauri::ipc::Response, String> {
    use std::io::{Seek, SeekFrom};
    
    ensure_supported_file(Path::new(&path), "gelesen")?;

    if length > MAX_READ_CHUNK_SIZE {
        return Err(format!("Ein Lese-Chunk darf höchstens {} MB groß sein", MAX_READ_CHUNK_SIZE / 1024 / 1024));
    }

    let file_size = fs::metadata(&path)
        .map_err(|e| format!("Fehler beim Lesen der Metadaten: {}", e))?
        .len();
    if offset > file_size {
        return Err("Der Lese-Offset liegt hinter dem Dateiende".to_string());
    }
    let length = length.min(file_size - offset);
    
    let mut file = fs::File::open(&path)
        .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Fehler beim Seek: {}", e))?;
    
    let capacity = usize::try_from(length)
        .map_err(|_| "Ungültige Chunk-Größe".to_string())?;
    let mut buffer = Vec::with_capacity(capacity);
    file.take(length).read_to_end(&mut buffer)
        .map_err(|e| format!("Fehler beim Lesen: {}", e))?;
    
    Ok(tauri::ipc::Response::new(buffer))
}

// Fast file writing command
#[tauri::command]
fn write_file_fast(path: String, content: String) -> Result<(), String> {
    // Validate file path: only allow JSON files for writing
    ensure_supported_file(Path::new(&path), "geschrieben")?;
    fs::write(&path, content).map_err(|e| format!("Fehler beim Schreiben: {}", e))
}

// Start an atomic chunked save in a temporary sibling file.
#[tauri::command]
fn save_file_start(path: String, store: tauri::State<'_, ChunkedSaveStore>) -> Result<(), String> {
    let target = PathBuf::from(path);
    ensure_supported_file(&target, "geschrieben")?;

    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target.file_name()
        .and_then(|name| name.to_str())
        .ok_or("Ungültiger Dateiname".to_string())?;
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Systemzeit-Fehler: {}", e))?
        .as_nanos();
    let temporary = parent.join(format!(".{}.{}.{}.tmp", file_name, std::process::id(), unique));

    fs::OpenOptions::new().write(true).create_new(true).open(&temporary)
        .map_err(|e| format!("Temporäre Datei konnte nicht erstellt werden: {}", e))?;

    let mut files = store.files.lock().map_err(|e| format!("Lock-Fehler: {}", e))?;
    if let Some(previous) = files.insert(target, temporary) {
        let _ = fs::remove_file(previous);
    }
    Ok(())
}

// Append a string chunk to the staged file, with optional LF→CRLF conversion.
#[tauri::command]
fn save_file_chunk(path: String, content: String, crlf: Option<bool>, store: tauri::State<'_, ChunkedSaveStore>) -> Result<(), String> {
    use std::io::Write;
    let target = PathBuf::from(path);
    ensure_supported_file(&target, "geschrieben")?;
    let temporary = store.files.lock().map_err(|e| format!("Lock-Fehler: {}", e))?
        .get(&target)
        .cloned()
        .ok_or("Kein aktiver Speichervorgang für diese Datei".to_string())?;
    let file = fs::OpenOptions::new().append(true).open(&temporary)
        .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    let mut writer = std::io::BufWriter::with_capacity(64 * 1024, file);

    if crlf.unwrap_or(false) {
        let bytes = content.as_bytes();
        let mut start = 0;
        for i in 0..bytes.len() {
            if bytes[i] == b'\n' {
                writer.write_all(&bytes[start..i]).map_err(|e| format!("Schreibfehler: {}", e))?;
                writer.write_all(b"\r\n").map_err(|e| format!("Schreibfehler: {}", e))?;
                start = i + 1;
            }
        }
        if start < bytes.len() {
            writer.write_all(&bytes[start..]).map_err(|e| format!("Schreibfehler: {}", e))?;
        }
    } else {
        writer.write_all(content.as_bytes()).map_err(|e| format!("Schreibfehler: {}", e))?;
    }
    writer.flush().map_err(|e| format!("Flush-Fehler: {}", e))?;
    Ok(())
}

// Commit a fully written staged file by replacing the target with its sibling.
#[tauri::command]
fn save_file_finish(path: String, store: tauri::State<'_, ChunkedSaveStore>) -> Result<(), String> {
    let target = PathBuf::from(path);
    ensure_supported_file(&target, "geschrieben")?;
    let temporary = store.files.lock().map_err(|e| format!("Lock-Fehler: {}", e))?
        .get(&target)
        .cloned()
        .ok_or("Kein aktiver Speichervorgang für diese Datei".to_string())?;

    fs::rename(&temporary, &target)
        .map_err(|e| format!("Temporäre Datei konnte nicht übernommen werden: {}", e))?;
    store.files.lock().map_err(|e| format!("Lock-Fehler: {}", e))?.remove(&target);
    Ok(())
}

#[tauri::command]
fn save_file_cancel(path: String, store: tauri::State<'_, ChunkedSaveStore>) -> Result<(), String> {
    let target = PathBuf::from(path);
    let temporary = store.files.lock().map_err(|e| format!("Lock-Fehler: {}", e))?
        .remove(&target);
    if let Some(temporary) = temporary {
        fs::remove_file(temporary).map_err(|e| format!("Temporäre Datei konnte nicht entfernt werden: {}", e))?;
    }
    Ok(())
}

// Writer wrapper that converts LF to CRLF (for files that originally used Windows line endings)
struct CrlfWriter<W: std::io::Write> {
    inner: W,
}

impl<W: std::io::Write> std::io::Write for CrlfWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        // serde_json only emits raw 0x0A for formatting newlines (string content is \n escaped)
        // So every 0x0A byte in the output is a formatting newline we can convert to \r\n
        let mut start = 0;
        for (i, &b) in buf.iter().enumerate() {
            if b == b'\n' {
                if i > start {
                    self.inner.write_all(&buf[start..i])?;
                }
                self.inner.write_all(b"\r\n")?;
                start = i + 1;
            }
        }
        if start < buf.len() {
            self.inner.write_all(&buf[start..])?;
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

// Detect JSON formatting from raw bytes: indent string + CRLF flag
fn detect_json_format(bytes: &[u8]) -> (String, bool) {
    let sample_len = bytes.len().min(32768);
    let sample = &bytes[..sample_len];

    // Detect CRLF
    let uses_crlf = sample.windows(2).any(|w| w == b"\r\n");

    // Split into lines and measure indentation of each line
    let newline = if uses_crlf { b"\r\n".as_slice() } else { b"\n".as_slice() };
    let mut indent_levels: Vec<usize> = Vec::new();
    let mut uses_tabs = false;
    
    let mut pos = 0;
    while pos < sample_len {
        // Find end of line
        let line_end = if uses_crlf {
            sample[pos..].windows(2).position(|w| w == b"\r\n")
                .map(|p| pos + p)
                .unwrap_or(sample_len)
        } else {
            sample[pos..].iter().position(|&b| b == b'\n')
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
            let diff = if window[1] > window[0] { window[1] - window[0] } else { 0 };
            if diff > 0 && diff <= 16 {
                diffs.push(diff);
            }
        }
        
        if diffs.is_empty() {
            // Fallback: find the smallest non-zero indent level
            let min_indent = indent_levels.iter().copied().filter(|&x| x > 0).min().unwrap_or(2);
            " ".repeat(min_indent)
        } else {
            // Compute GCD of all observed diffs — this finds the true base unit
            fn gcd(a: usize, b: usize) -> usize {
                if b == 0 { a } else { gcd(b, a % b) }
            }
            let base = diffs.iter().copied().fold(0usize, |acc, d| gcd(acc, d));
            let base = if base == 0 { 2 } else { base };
            " ".repeat(base)
        }
    };

    (indent, uses_crlf)
}

// Helper: serialize JSON with custom indent into a writer
fn serialize_with_indent<W: std::io::Write>(writer: W, data: &serde_json::Value, indent: &[u8]) -> Result<(), String> {
    use serde::Serialize;
    let formatter = serde_json::ser::PrettyFormatter::with_indent(indent);
    let mut serializer = serde_json::Serializer::with_formatter(writer, formatter);
    data.serialize(&mut serializer)
        .map_err(|e| format!("Fehler beim Schreiben: {}", e))
}

// Copy a file byte-for-byte (for saving unmodified files 1:1)
#[tauri::command]
fn copy_file(source: String, dest: String) -> Result<(), String> {
    ensure_supported_file(Path::new(&source), "gelesen")?;
    ensure_supported_file(Path::new(&dest), "geschrieben")?;
    // If source == dest, nothing to do (file is already there)
    if source == dest {
        return Ok(());
    }
    fs::copy(&source, &dest)
        .map_err(|e| format!("Fehler beim Kopieren: {}", e))?;
    Ok(())
}

// Save JSON data with streaming write (avoids OOM for large files)
// Strips internal __size/__depthSizes metadata before writing.
// Reproduces original formatting: indent style + line endings.
#[tauri::command]
fn write_json_pretty(
    path: String,
    data: serde_json::Value,
    pretty: Option<bool>,
    concatenated: Option<bool>,
    indent: Option<String>,
    crlf: Option<bool>,
) -> Result<(), String> {
    ensure_supported_file(Path::new(&path), "geschrieben")?;

    // Strip __size and __depthSizes metadata added by the viewer
    let clean_data = strip_metadata(data);

    let file = fs::File::create(&path)
        .map_err(|e| format!("Fehler beim Erstellen: {}", e))?;
    let buf_writer = std::io::BufWriter::with_capacity(64 * 1024, file);
    let indent_bytes = indent.as_deref().unwrap_or("  ").as_bytes().to_vec();
    let use_crlf = crlf.unwrap_or(false);

    if concatenated.unwrap_or(false) {
        if let serde_json::Value::Array(items) = &clean_data {
            use std::io::Write;
            if use_crlf {
                let mut writer = CrlfWriter { inner: buf_writer };
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        writer.inner.write_all(b"\r\n").map_err(|e| format!("Schreibfehler: {}", e))?;
                    }
                    serialize_with_indent(&mut writer, item, &indent_bytes)?;
                }
                writer.inner.write_all(b"\r\n").map_err(|e| format!("Schreibfehler: {}", e))?;
                writer.flush().map_err(|e| format!("Flush-Fehler: {}", e))?;
            } else {
                let mut writer = buf_writer;
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        writer.write_all(b"\n").map_err(|e| format!("Schreibfehler: {}", e))?;
                    }
                    serialize_with_indent(&mut writer, item, &indent_bytes)?;
                }
                writer.write_all(b"\n").map_err(|e| format!("Schreibfehler: {}", e))?;
                writer.flush().map_err(|e| format!("Flush-Fehler: {}", e))?;
            }
            Ok(())
        } else {
            write_single_value(buf_writer, &clean_data, &indent_bytes, use_crlf)
        }
    } else if pretty.unwrap_or(false) {
        write_single_value(buf_writer, &clean_data, &indent_bytes, use_crlf)
    } else {
        serde_json::to_writer(buf_writer, &clean_data)
            .map_err(|e| format!("Fehler beim Schreiben: {}", e))
    }
}

fn write_single_value<W: std::io::Write>(writer: W, data: &serde_json::Value, indent: &[u8], use_crlf: bool) -> Result<(), String> {
    if use_crlf {
        serialize_with_indent(CrlfWriter { inner: writer }, data, indent)
    } else {
        serialize_with_indent(writer, data, indent)
    }
}

// Strip __size and __depthSizes metadata from JSON data (iterative to avoid stack overflow on deep trees)
fn strip_metadata(mut value: serde_json::Value) -> serde_json::Value {
    let mut stack: Vec<*mut serde_json::Value> = vec![&mut value as *mut _];
    while let Some(ptr) = stack.pop() {
        let val = unsafe { &mut *ptr };
        match val {
            serde_json::Value::Object(map) => {
                map.remove("__size");
                map.remove("__depthSizes");
                for (_, v) in map.iter_mut() {
                    match v {
                        serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                            stack.push(v as *mut _);
                        }
                        _ => {}
                    }
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr.iter_mut() {
                    match item {
                        serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                            stack.push(item as *mut _);
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    value
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

#[tauri::command]
fn parse_json_compact(path: String, store: tauri::State<'_, CompactStore>) -> Result<CompactResult, String> {
    ensure_supported_file(Path::new(&path), "gelesen")?;
    
    let original_size = fs::metadata(&path)
        .map_err(|e| format!("Metadaten-Fehler: {}", e))?.len();
    
    // Read raw bytes
    let mut bytes = fs::read(&path)
        .map_err(|e| format!("Fehler beim Lesen: {}", e))?;
    
    // Strip UTF-8 BOM if present
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        bytes = bytes[3..].to_vec();
    }
    
    // Detect original formatting (indent style + line endings) BEFORE parsing
    let (indent, uses_crlf) = detect_json_format(&bytes);
    
    // Parse with serde_json (streaming, fast, memory-efficient)
    // First try single JSON value; if trailing chars, try concatenated JSON objects
    let mut was_concatenated = false;
    let value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(v) => {
            drop(bytes);
            v
        }
        Err(ref e) if e.classify() == serde_json::error::Category::Data
            || e.to_string().contains("trailing") =>
        {
            was_concatenated = true;
            // Concatenated JSON (multiple root objects) – parse all and wrap in array
            let mut stream = serde_json::Deserializer::from_slice(&bytes).into_iter::<serde_json::Value>();
            let mut objects: Vec<serde_json::Value> = Vec::new();
            while let Some(result) = stream.next() {
                let obj = result.map_err(|e2| format!("JSON-Parse-Fehler (Objekt {}): {}", objects.len() + 1, e2))?;
                objects.push(obj);
            }
            drop(bytes);
            if objects.is_empty() {
                return Err("JSON-Datei enthält keine gültigen Objekte".to_string());
            }
            serde_json::Value::Array(objects)
        }
        Err(e) => return Err(format!("JSON-Parse-Fehler: {}", e)),
    };
    
    // Count nodes
    let node_count = count_json_value(&value);
    
    // Serialize compact JSON to memory (removes all formatting whitespace)
    let compact_bytes = serde_json::to_vec(&value)
        .map_err(|e| format!("Fehler beim Serialisieren: {}", e))?;
    let compact_size = compact_bytes.len() as u64;
    
    // Free the parsed value
    drop(value);
    
    // Store compact bytes in memory for retrieval via get_compact_bytes
    *store.data.lock().map_err(|e| format!("Lock-Fehler: {}", e))? = Some(compact_bytes);
    
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
fn get_compact_bytes(store: tauri::State<'_, CompactStore>) -> Result<tauri::ipc::Response, String> {
    let data = store.data.lock()
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
fn get_file_size(path: String) -> Result<u64, String> {
    ensure_supported_file(Path::new(&path), "gelesen")?;
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Fehler Metadaten: {}", e))?;
    Ok(metadata.len())
}

#[tauri::command]
fn get_file_stats(path: String) -> Result<FileStats, String> {
    ensure_supported_file(Path::new(&path), "gelesen")?;

    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Fehler Metadaten: {}", e))?;
    let size_bytes = metadata.len();

    // For files > 50 MB, only return size (avoid re-reading and re-parsing)
    if size_bytes > 50 * 1024 * 1024 {
        return Ok(FileStats { size_bytes, node_count: 0 });
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Fehler beim Lesen: {}", e))?;

    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON-Parse-Fehler: {}", e))?;

    let node_count = count_json_value(&parsed);

    Ok(FileStats { size_bytes, node_count })
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
        let app_data = std::env::var("APPDATA").unwrap_or_else(|_| {
            std::env::temp_dir().to_string_lossy().to_string()
        });
        PathBuf::from(app_data)
            .join("com.jsonviewer.app")
            .join("window_state.json")
    }
    
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| {
            std::env::temp_dir().to_string_lossy().to_string()
        });
        PathBuf::from(home)
            .join("Library/Application Support/com.jsonviewer.app")
            .join("window_state.json")
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| {
            std::env::temp_dir().to_string_lossy().to_string()
        });
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
        x: 0,  // Don't save position
        y: 0   // Don't save position
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

fn build_menu(app_handle: &AppHandle, lang: &str) -> Result<(), Box<dyn std::error::Error>> {
    let is_en = lang == "en";
    
    // App menu (macOS-specific)
    #[cfg(target_os = "macos")]
    let app_menu = {
        let about_metadata = AboutMetadata {
            name: Some("JSON Viewer/Editor".to_string()),
            version: Some("1.3.5".to_string()),
            copyright: Some("© 2026 Norbert Jander".to_string()),
            authors: Some(vec!["Norbert Jander".to_string()]),
            comments: Some(if is_en { 
                "A powerful JSON viewer and editor".to_string() 
            } else { 
                "Ein leistungsstarker JSON Viewer und Editor".to_string() 
            }),
            ..Default::default()
        };
        
        let about = PredefinedMenuItem::about(
            app_handle, 
            Some(if is_en { "About JSON Viewer" } else { "Über JSON Viewer" }), 
            Some(about_metadata)
        )?;
        let separator = PredefinedMenuItem::separator(app_handle)?;
        let hide = PredefinedMenuItem::hide(
            app_handle, 
            Some(if is_en { "Hide JSON Viewer" } else { "JSON Viewer ausblenden" })
        )?;
        let hide_others = PredefinedMenuItem::hide_others(
            app_handle, 
            Some(if is_en { "Hide Others" } else { "Andere ausblenden" })
        )?;
        let show_all = PredefinedMenuItem::show_all(
            app_handle, 
            Some(if is_en { "Show All" } else { "Alle einblenden" })
        )?;
        let quit = PredefinedMenuItem::quit(
            app_handle, 
            Some(if is_en { "Quit JSON Viewer" } else { "JSON Viewer beenden" })
        )?;
        
        Submenu::with_items(
            app_handle,
            "JSON Viewer",
            true,
            &[&about, &separator, &hide, &hide_others, &show_all, &PredefinedMenuItem::separator(app_handle)?, &quit],
        )?
    };
    
    // File menu
    let open_item = MenuItem::with_id(
        app_handle, 
        "open", 
        if is_en { "Open..." } else { "Öffnen..." }, 
        true, 
        Some("CmdOrCtrl+O")
    )?;
    let save_item = MenuItem::with_id(
        app_handle, 
        "save", 
        if is_en { "Save" } else { "Speichern" }, 
        true, 
        Some("CmdOrCtrl+S")
    )?;
    let close = PredefinedMenuItem::close_window(
        app_handle, 
        Some(if is_en { "Close Window" } else { "Fenster schließen" })
    )?;
    
    let file_menu = Submenu::with_items(
        app_handle,
        if is_en { "File" } else { "Datei" },
        true,
        &[&open_item, &save_item, &PredefinedMenuItem::separator(app_handle)?, &close],
    )?;
    
    // Edit menu
    let undo = MenuItem::with_id(
        app_handle, 
        "undo", 
        if is_en { "Undo" } else { "Rückgängig" }, 
        true, 
        Some("CmdOrCtrl+Z")
    )?;
    let redo = MenuItem::with_id(
        app_handle, 
        "redo", 
        if is_en { "Redo" } else { "Wiederholen" }, 
        true, 
        Some("CmdOrCtrl+Shift+Z")
    )?;
    let cut = MenuItem::with_id(
        app_handle, 
        "cut", 
        if is_en { "Cut" } else { "Ausschneiden" }, 
        true, 
        Some("CmdOrCtrl+X")
    )?;
    let copy = MenuItem::with_id(
        app_handle, 
        "copy", 
        if is_en { "Copy" } else { "Kopieren" }, 
        true, 
        Some("CmdOrCtrl+C")
    )?;
    let paste = MenuItem::with_id(
        app_handle, 
        "paste", 
        if is_en { "Paste" } else { "Einsetzen" }, 
        true, 
        Some("CmdOrCtrl+V")
    )?;
    let select_all = MenuItem::with_id(
        app_handle, 
        "select_all", 
        if is_en { "Select All" } else { "Alles auswählen" }, 
        true, 
        Some("CmdOrCtrl+A")
    )?;
    
    let edit_menu = Submenu::with_id_and_items(
        app_handle,
        "edit_menu_custom",
        if is_en { "Edit" } else { "Bearbeiten" },
        true,
        &[&undo, &redo, &PredefinedMenuItem::separator(app_handle)?, &cut, &copy, &paste, &PredefinedMenuItem::separator(app_handle)?, &select_all],
    )?;
    
    // View menu
    let expand_all = MenuItem::with_id(
        app_handle, 
        "expand_all", 
        if is_en { "Expand All" } else { "Alle aufklappen" }, 
        true, 
        Some("CmdOrCtrl+E")
    )?;
    let collapse_all = MenuItem::with_id(
        app_handle, 
        "collapse_all", 
        if is_en { "Collapse All" } else { "Alle zuklappen" }, 
        true, 
        Some("CmdOrCtrl+W")
    )?;
    let goto_line = MenuItem::with_id(
        app_handle, 
        "goto_line", 
        if is_en { "Go to Line..." } else { "Gehe zu Zeile..." }, 
        true, 
        Some("CmdOrCtrl+Shift+L")
    )?;
    
    #[cfg(target_os = "macos")]
    let fullscreen = PredefinedMenuItem::fullscreen(
        app_handle, 
        Some(if is_en { "Fullscreen" } else { "Vollbild" })
    )?;
    
    // Theme submenu
    let theme_dark = MenuItem::with_id(app_handle, "theme_dark", if is_en { "Dark" } else { "Dunkel" }, true, None::<&str>)?;
    let theme_light = MenuItem::with_id(app_handle, "theme_light", if is_en { "Light" } else { "Hell" }, true, None::<&str>)?;
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
        &[&expand_all, &collapse_all, &PredefinedMenuItem::separator(app_handle)?, &goto_line, &PredefinedMenuItem::separator(app_handle)?, &theme_menu, &lang_menu, &PredefinedMenuItem::separator(app_handle)?, &fullscreen],
    )?;
    
    #[cfg(not(target_os = "macos"))]
    let view_menu = Submenu::with_items(
        app_handle,
        if is_en { "View" } else { "Ansicht" },
        true,
        &[&expand_all, &collapse_all, &PredefinedMenuItem::separator(app_handle)?, &goto_line, &PredefinedMenuItem::separator(app_handle)?, &theme_menu, &lang_menu],
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
    
    // Help menu
    let help_item = MenuItem::with_id(
        app_handle, 
        "show_help", 
        if is_en { "JSON Viewer Help" } else { "JSON Viewer Hilfe" }, 
        true, 
        Some("F1")
    )?;
    
    let help_menu = Submenu::with_items(
        app_handle,
        if is_en { "Help" } else { "Hilfe" },
        true,
        &[&help_item],
    )?;
    
    // Build menu - macOS has app menu, Windows/Linux don't
    #[cfg(target_os = "macos")]
    let menu = Menu::with_items(
        app_handle,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
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
      "--js-flags=--max-old-space-size=8192"
    );
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_cli::init())
    .manage(CompactStore { data: Mutex::new(None) })
    .manage(ChunkedSaveStore { files: Mutex::new(HashMap::new()) })
    .invoke_handler(tauri::generate_handler![read_file_fast, read_file_raw, read_file_chunk, write_file_fast, write_json_pretty, copy_file, save_file_start, save_file_chunk, save_file_finish, save_file_cancel, parse_json_compact, get_compact_bytes, get_file_stats, get_file_size, set_menu_language, get_window_state, save_window_state])
    .setup(|app| {
      let app_handle = app.handle();
      
      // Restore window state from saved settings
      if let Some(window) = app.get_webview_window("main") {
          // First, make sure the window is visible and centered
          let _ = window.show();
          let _ = window.set_focus();
          let _ = window.unminimize();
          
          // Only restore size, not position to avoid off-screen issues
          if let Some(state) = get_window_state() {
              if state.width >= 800 && state.height >= 600 {
                  let _ = window.set_size(tauri::LogicalSize::new(state.width as f64, state.height as f64));
              }
              // Center the window instead of using saved position
              let _ = window.center();
          } else {
              // If no saved state, ensure window is centered
              let _ = window.center();
          }
      }
      
      // Check for file argument using CLI plugin
      let mut file_opened = false;
      if let Ok(matches) = app.cli().matches() {
          if let Some(file_arg) = matches.args.get("file") {
              if let Some(file_path) = file_arg.value.as_str() {
                  if is_supported_file(Path::new(file_path)) && Path::new(file_path).exists() {
                      let path_clone = file_path.to_string();
                      let app_handle_clone = app_handle.clone();
                      file_opened = true;
                      std::thread::spawn(move || {
                          std::thread::sleep(std::time::Duration::from_millis(800));
                          let _ = app_handle_clone.emit("open-file", &path_clone);
                      });
                  }
              }
          }
      }
      
      // Fallback: Check raw env args (for "Open With") — only if CLI plugin didn't find a file
      if !file_opened {
          let args: Vec<String> = std::env::args().collect();
          for arg in args.iter().skip(1) {
              if is_supported_file(Path::new(arg)) && Path::new(arg).exists() {
                  let path_clone = arg.clone();
                  let app_handle_clone = app_handle.clone();
                  std::thread::spawn(move || {
                      std::thread::sleep(std::time::Duration::from_millis(800));
                      let _ = app_handle_clone.emit("open-file", &path_clone);
                  });
                  break;
              }
          }
      }
      
      // Build initial menu in German
      build_menu(app_handle, "de")?;
      
      // Handle menu events
      app.on_menu_event(move |app, event| {
        let id = event.id().as_ref();
        if let Some(window) = app.get_webview_window("main") {
          match id {
            "open" => { let _ = window.eval("openFile()"); }
            "save" => { let _ = window.eval("saveFile()"); }
            "expand_all" => { let _ = window.eval("expandAll()"); }
            "collapse_all" => { let _ = window.eval("collapseAll()"); }
            "goto_line" => { let _ = window.eval("showGotoLineDialog()"); }
            "show_help" => { let _ = window.eval("showHelp()"); }
            "minimize" => { let _ = window.minimize(); }
            // Edit menu handlers
            "undo" => { let _ = window.eval("document.execCommand('undo')"); }
            "redo" => { let _ = window.eval("document.execCommand('redo')"); }
            "cut" => { let _ = window.eval("document.execCommand('cut')"); }
            "copy" => { let _ = window.eval("document.execCommand('copy')"); }
            "paste" => { let _ = window.eval("document.execCommand('paste')"); }
            "select_all" => { let _ = window.eval("document.execCommand('selectAll')"); }
            // Theme handlers
            "theme_dark" => { let _ = window.eval("setTheme('dark')"); }
            "theme_light" => { let _ = window.eval("setTheme('light')"); }
            // Language handlers
            "lang_de" => { let _ = window.eval("setLanguage('de')"); }
            "lang_en" => { let _ = window.eval("setLanguage('en')"); }
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
        if let Some(path) = paths.first() {
          if is_supported_file(path) {
            let path_str = path.to_string_lossy().to_string();
            let _ = window.emit("open-file", &path_str);
          }
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, event| {
      // On macOS, file associations (double-click in Finder, "Open With…") are
      // delivered via Apple Events, surfaced by Tauri as RunEvent::Opened { urls }.
      // CLI/env args are NOT populated in this case, so we must handle it here.
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Opened { urls } = &event {
        for url in urls {
          // Tauri delivers a file:// URL; convert to a local path.
          let path_opt = url.to_file_path().ok()
            .or_else(|| Some(std::path::PathBuf::from(url.path())));
          if let Some(path) = path_opt {
            let path_str = path.to_string_lossy().to_string();
            if is_supported_file(&path) && path.exists() {
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
