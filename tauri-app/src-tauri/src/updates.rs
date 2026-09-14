use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState(pub Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    current_version: String,
    body: Option<String>,
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<UpdateInfo>, String> {
    *state.0.lock().map_err(|e| e.to_string())? = None;
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        body: u.body.clone(),
    });
    *state.0.lock().map_err(|e| e.to_string())? = update;
    Ok(info)
}

#[derive(Clone, Serialize)]
struct Progress {
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if std::env::var_os("APPIMAGE").is_none() {
        return Err("Automatische Installation ist unter Linux nur für AppImage verfügbar. DEB/RPM bitte über die GitHub-Releases aktualisieren: https://github.com/nojan01/json-viewer-editor/releases/latest".into());
    }
    let mut update = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("Bitte zuerst nach Updates suchen / Check for updates first")?;
    // Checking should be quick; downloading a large installer can take longer.
    update.timeout = Some(Duration::from_secs(600));
    let mut downloaded = 0;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = app.emit(
                    "update-progress",
                    Progress {
                        phase: "downloading",
                        downloaded,
                        total,
                    },
                );
            },
            || {
                let _ = app.emit(
                    "update-progress",
                    Progress {
                        phase: "installing",
                        downloaded: 0,
                        total: None,
                    },
                );
            },
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restart_application(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn exit_application(app: AppHandle) {
    app.exit(0);
}
