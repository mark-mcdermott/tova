/*!
Tova's backend, being ported from `src/main` one module at a time.

The rule for the whole port: the IPC surface does not move. Every command here
answers to the same name and the same shape as the Electron handler it
replaces, so both backends stay runnable against one conformance suite and a
slice can land without the renderer knowing which one it is talking to.
*/

mod bridge;
mod preferences;
mod screen;
mod sections;
mod session;

use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    /// Empty here: there is no Electron to name. The field stays because the
    /// renderer's About panel reads it.
    electron: String,
    chrome: String,
    vault_path: String,
}

/// `window.tova.app.info()`. The first slice, and the smallest: it proves the
/// whole path — renderer to command to answer — without touching the vault.
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        electron: String::new(),
        chrome: tauri::webview_version().unwrap_or_else(|_| "unknown".into()),
        vault_path: String::new(),
    }
}

/*
 * Electron's userData, not Tauri's own.
 *
 * Tauri would put this under the bundle identifier and Electron puts it under
 * the app name, so the two would keep separate preferences and separate
 * avatars — and the point of porting a slice at a time is being able to run
 * either backend against the same state and see the same app. It moves when the
 * Electron side is gone, not before.
 */
fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("tova")
}

#[tauri::command]
fn preferences_read() -> preferences::Preferences {
    preferences::read(&data_dir())
}

#[tauri::command]
fn preferences_write(value: Value) -> preferences::Preferences {
    preferences::write_value(&data_dir(), &value)
}

#[tauri::command]
fn account_name() -> String {
    preferences::account_name()
}

#[tauri::command]
fn session_read() -> Option<screen::Screen> {
    session::read(&data_dir())
}

#[tauri::command]
fn session_write(value: Value) {
    session::write(&data_dir(), &value)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_info,
            preferences_read,
            preferences_write,
            account_name,
            session_read,
            session_write
        ])
        .setup(|app| {
            // Built here rather than declared in tauri.conf.json for one
            // reason: an initialization script can only be attached to a
            // window as it is created, and that script is how the renderer
            // gets `window.tova` before its own first import — which is
            // exactly what the Electron preload does.
            let window =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                    .title("Tova")
                    .inner_size(1280.0, 860.0)
                    .min_inner_size(720.0, 480.0)
                    .initialization_script(bridge::INIT_SCRIPT);

            // The traffic lights sit in the window, over the sidebar, the way
            // Electron's titleBarStyle: "hiddenInset" puts them. Both builder
            // methods are macOS-only, so the chain has to fork rather than
            // carry them everywhere — CI compiles this on Linux.
            #[cfg(target_os = "macos")]
            let window = window
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true);

            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("tova failed to start");
}
