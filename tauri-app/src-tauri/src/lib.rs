use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem};
#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
use tauri::{Manager, AppHandle, Emitter};
use tauri_plugin_cli::CliExt;
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

// Fast file reading command - bypasses JS fs API overhead
#[tauri::command]
fn read_file_fast(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Fehler beim Lesen: {}", e))
}

// Fast file writing command
#[tauri::command]
fn write_file_fast(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Fehler beim Schreiben: {}", e))
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
        let app_data = std::env::var("APPDATA").unwrap_or_else(|_| String::from("C:\\"));
        PathBuf::from(app_data)
            .join("com.jsonviewer.app")
            .join("window_state.json")
    }
    
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| String::from("/tmp"));
        PathBuf::from(home)
            .join("Library/Application Support/com.jsonviewer.app")
            .join("window_state.json")
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| String::from("/tmp"));
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
fn save_window_state(width: u32, height: u32, x: i32, y: i32) -> Result<(), String> {
    let path = get_window_state_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let state = WindowState { width, height, x, y };
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
    
    // App menu (macOS-specific, but kept for compatibility)
    #[cfg(target_os = "macos")]
    {
        let about_metadata = AboutMetadata {
            name: Some("JSON Viewer/Editor".to_string()),
            version: Some("1.0.0".to_string()),
            copyright: Some("© 2025 Norbert Jander".to_string()),
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
        
        let app_menu = Submenu::with_items(
            app_handle,
            "JSON Viewer",
            true,
            &[&about, &separator, &hide, &hide_others, &show_all, &PredefinedMenuItem::separator(app_handle)?, &quit],
        )?;
    }
    
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
    let minimize = PredefinedMenuItem::minimize(
        app_handle, 
        Some(if is_en { "Minimize" } else { "Minimieren" })
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
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_cli::init())
    .invoke_handler(tauri::generate_handler![read_file_fast, write_file_fast, set_menu_language, get_window_state, save_window_state])
    .setup(|app| {
      let app_handle = app.handle();
      
      // Restore window state from saved settings
      if let Some(window) = app.get_webview_window("main") {
          if let Some(state) = get_window_state() {
              if state.width >= 800 && state.height >= 600 {
                  let _ = window.set_size(tauri::LogicalSize::new(state.width as f64, state.height as f64));
              }
              let _ = window.set_position(tauri::LogicalPosition::new(state.x as f64, state.y as f64));
          }
      }
      
      // Check for file argument using CLI plugin
      if let Ok(matches) = app.cli().matches() {
          if let Some(file_arg) = matches.args.get("file") {
              if let Some(file_path) = file_arg.value.as_str() {
                  if file_path.ends_with(".json") && std::path::Path::new(file_path).exists() {
                      let path_clone = file_path.to_string();
                      let app_handle_clone = app_handle.clone();
                      std::thread::spawn(move || {
                          std::thread::sleep(std::time::Duration::from_millis(800));
                          if let Some(window) = app_handle_clone.get_webview_window("main") {
                              let escaped = path_clone.replace("\\", "\\\\").replace("'", "\\'");
                              let _ = window.eval(&format!("loadFileFromPath('{}')", escaped));
                          }
                      });
                  }
              }
          }
      }
      
      // Fallback: Check raw env args (for "Open With")
      let args: Vec<String> = std::env::args().collect();
      println!("DEBUG: args = {:?}", args);
      for arg in args.iter().skip(1) {
          if arg.ends_with(".json") && std::path::Path::new(arg).exists() {
              let path_clone = arg.clone();
              let app_handle_clone = app_handle.clone();
              std::thread::spawn(move || {
                  std::thread::sleep(std::time::Duration::from_millis(800));
                  if let Some(window) = app_handle_clone.get_webview_window("main") {
                      let escaped = path_clone.replace("\\", "\\\\").replace("'", "\\'");
                      let _ = window.eval(&format!("loadFileFromPath('{}')", escaped));
                  }
              });
              break;
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
          if let Some(ext) = path.extension() {
            if ext == "json" {
              let path_str = path.to_string_lossy().to_string();
              let escaped = path_str.replace("\\", "\\\\").replace("'", "\\'");
              let js = format!("loadFileFromPath('{}')", escaped);
              let _ = window.emit("load-file", js);
            }
          }
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, event| {
      // Handle run events - RunEvent::Opened doesn't exist in Tauri v2
      // File associations are handled via CLI args and drag & drop events
      if let tauri::RunEvent::ExitRequested { .. } = event {
        // Application exit event
      }
    });
}
