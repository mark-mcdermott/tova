/*!
Tova's backend, being ported from `src/main` one module at a time.

The rule for the whole port: the IPC surface does not move. Every command here
answers to the same name and the same shape as the Electron handler it
replaces, so both backends stay runnable against one conformance suite and a
slice can land without the renderer knowing which one it is talking to.
*/

mod bridge;
mod crypto;
mod preferences;
mod safe_storage;
mod screen;
mod sections;
mod session;
mod vault;
mod vault_file;
mod vault_keys;
mod vaults;

use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

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

#[tauri::command]
fn vault_list() -> Vec<vaults::VaultChoice> {
    vaults::list(&data_dir())
}

#[tauri::command]
fn vault_use(path: String) -> Result<Vec<vaults::VaultChoice>, String> {
    vaults::use_vault(&data_dir(), Path::new(&path))
}

#[tauri::command]
fn vault_forget(path: String) -> Result<Vec<vaults::VaultChoice>, String> {
    vaults::forget_vault(&data_dir(), Path::new(&path))
}

#[tauri::command]
fn vault_encrypt(path: String) -> Result<String, String> {
    vaults::encrypt_vault(&data_dir(), Path::new(&path))
}

#[tauri::command]
fn vault_decrypt(path: String) -> Result<Vec<vaults::VaultChoice>, String> {
    vaults::decrypt_vault(&data_dir(), Path::new(&path))
}

#[tauri::command]
fn vault_unlock(path: String, recovery_key: String) -> Result<bool, String> {
    vaults::unlock_vault(&data_dir(), Path::new(&path), &recovery_key)
}

/// The picker is here and the decision is not: `add_vault` takes a folder, so
/// what Tova makes of one stays testable without a dialog on screen.
#[tauri::command]
async fn vault_add(app: tauri::AppHandle) -> Result<Vec<vaults::VaultChoice>, String> {
    use tauri_plugin_dialog::DialogExt;

    let chosen = app
        .dialog()
        .file()
        .set_title("Choose a folder for the vault")
        .blocking_pick_folder();

    let Some(chosen) = chosen else {
        return Ok(vaults::list(&data_dir()));
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    vaults::add_vault(&data_dir(), &path)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            preferences_read,
            preferences_write,
            account_name,
            session_read,
            session_write,
            vault_list,
            vault_use,
            vault_add,
            vault_forget,
            vault_encrypt,
            vault_decrypt,
            vault_unlock
        ])
        .setup(|app| {
            let stored = preferences::read(&data_dir());
            vault::set_active_vault(stored.active_vault.as_ref().map(PathBuf::from));
            // Before ensure_vault, which writes: a sealed vault has to be open
            // first or the files it makes are plain inside a closed vault.
            vault_keys::unlock_vault(&data_dir(), &vault::vault_root());
            let sections: Vec<String> = stored.sections.iter().map(|s| s.id.clone()).collect();
            let _ = vault::ensure_vault(&vault::vault_root(), &sections);

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
