/*!
Tova's backend, being ported from `src/main` one module at a time.

The rule for the whole port: the IPC surface does not move. Every command here
answers to the same name and the same shape as the Electron handler it
replaces, so both backends stay runnable against one conformance suite and a
slice can land without the renderer knowing which one it is talking to.
*/

mod bridge;

use serde::Serialize;

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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .setup(|app| {
            // Built here rather than declared in tauri.conf.json for one
            // reason: an initialization script can only be attached to a
            // window as it is created, and that script is how the renderer
            // gets `window.tova` before its own first import — which is
            // exactly what the Electron preload does.
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("Tova")
                .inner_size(1280.0, 860.0)
                .min_inner_size(720.0, 480.0)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .initialization_script(bridge::INIT_SCRIPT)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("tova failed to start");
}
