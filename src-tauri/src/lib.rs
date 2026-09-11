/*!
Tova's backend, being ported from `src/main` one module at a time.

The rule for the whole port: the IPC surface does not move. Every command here
answers to the same name and the same shape as the Electron handler it
replaces, so both backends stay runnable against one conformance suite and a
slice can land without the renderer knowing which one it is talking to.
*/

mod backup;
mod blog_post;
mod blogs;
mod bridge;
/// The text layer's conformance tests, in one place — see the module for why.
#[cfg(test)]
mod conformance;
mod crypto;
mod daily;
mod date;
mod deploys;
mod front_matter;
mod github;
mod images;
mod js;
mod media;
mod note_location;
mod note_name;
mod notes;
#[cfg(test)]
mod posts_conformance;
mod preferences;
mod publish_state;
mod publisher;
mod safe_storage;
mod screen;
mod search;
#[cfg(test)]
mod search_conformance;
mod sections;
mod session;
mod settings;
mod sync;
mod sync_plan;
mod tags;
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
    backup_path: String,
}

/// `window.tova.app.info()`. The first slice, and the smallest: it proves the
/// whole path — renderer to command to answer — without touching the vault.
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        electron: String::new(),
        chrome: tauri::webview_version().unwrap_or_else(|_| "unknown".into()),
        vault_path: vault::vault_root().to_string_lossy().into_owned(),
        backup_path: backup::backup_root().to_string_lossy().into_owned(),
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

#[tauri::command]
fn note_list() -> Vec<notes::NoteSummary> {
    notes::list()
}

#[tauri::command]
fn note_read(id: String) -> Result<notes::Note, String> {
    notes::read(&id)
}

#[tauri::command]
fn note_create(input: notes::CreateNoteInput) -> Result<notes::Note, String> {
    notes::create(input)
}

#[tauri::command]
fn note_write(id: String, title: String, body: String) -> Result<notes::NoteSummary, String> {
    notes::write(&id, &title, &body)
}

#[tauri::command]
fn note_rename(id: String, title: String) -> Result<notes::NoteSummary, String> {
    notes::rename(&id, &title)
}

#[tauri::command]
fn note_favorite(id: String, favorite: bool) -> Result<notes::NoteSummary, String> {
    notes::set_favorite(&id, favorite)
}

/// Whatever arrives is normalised in `set_manual_tags`, so a hand-made call
/// cannot put a name in front matter the tag rules would refuse.
#[tauri::command]
fn note_tags(id: String, tags: Vec<String>) -> Result<notes::NoteSummary, String> {
    notes::set_manual_tags(&id, tags)
}

#[tauri::command]
fn note_versions(id: String) -> Vec<String> {
    backup::list_versions(&id)
}

#[tauri::command]
fn note_version_read(id: String, version: String) -> Result<String, String> {
    backup::read_version(&id, &version)
}

#[tauri::command]
fn note_move(id: String, input: notes::MoveNoteInput) -> Result<notes::NoteSummary, String> {
    notes::move_note(&id, input)
}

#[tauri::command]
fn note_remove(id: String) -> Result<notes::NoteSummary, String> {
    notes::trash_note(&id)
}

#[tauri::command]
fn note_restore(id: String) -> Result<notes::NoteSummary, String> {
    notes::restore_note(&id)
}

#[tauri::command]
fn note_permanent_delete(id: String) -> Result<(), String> {
    notes::permanent_delete(&id)
}

#[tauri::command]
fn folder_list() -> Result<Vec<String>, String> {
    notes::list_folders()
}

#[tauri::command]
fn folder_create(name: String) -> Result<String, String> {
    notes::create_folder(&name)
}

#[tauri::command]
fn folder_rename(from: String, to: String) -> Result<String, String> {
    notes::rename_folder(&from, &to)
}

#[tauri::command]
fn folder_delete(name: String) -> Result<Vec<String>, String> {
    notes::delete_folder(&name)
}

#[tauri::command]
fn section_create(id: String) -> Result<(), String> {
    notes::create_section(&id)
}

#[tauri::command]
fn section_delete(id: String) -> Result<Vec<String>, String> {
    notes::delete_section(&id)
}

#[tauri::command]
fn note_search(query: String) -> Vec<search::Hit> {
    search::search_notes(&query, 50)
}

#[tauri::command]
fn note_today() -> Result<notes::Note, String> {
    daily::today_note()
}

#[derive(Serialize)]
struct VaultStatus {
    empty: bool,
    backups: Vec<backup::BackupSummary>,
}

#[tauri::command]
fn backup_run() -> Result<backup::BackupSummary, String> {
    backup::run_backup(&backup::backup_root(), backup::DEFAULT_BACKUP_LIMIT)
}

#[tauri::command]
fn backup_list() -> Vec<backup::BackupSummary> {
    backup::list_backups(&backup::backup_root())
}

#[tauri::command]
fn backup_restore(name: String) -> Result<backup::BackupSummary, String> {
    backup::restore_backup(&backup::backup_root(), &name)
}

/// What the first-run screen asks: is there anything here, and is there
/// anything to put back if not.
#[tauri::command]
fn backup_status() -> VaultStatus {
    VaultStatus {
        empty: notes::list().is_empty(),
        backups: backup::list_backups(&backup::backup_root()),
    }
}

#[tauri::command]
fn image_save(name: String, bytes: Vec<u8>) -> Result<String, String> {
    images::save_image(&name, &bytes)
}

/// Writes the note to a location the reader picks. Exported verbatim, front
/// matter included — the file that lands on disk is the file Tova has, which
/// keeps the export lossless and re-importable.
#[tauri::command]
async fn note_export(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let location = vault::require_location(&id)?;
    let contents = vault_file::read_vault_text(&vault::note_path(&location)?)?;

    let chosen = app
        .dialog()
        .file()
        .set_title("Export note")
        .set_file_name(&location.filename)
        .add_filter("Markdown", &["md"])
        .blocking_save_file();

    let Some(chosen) = chosen.and_then(|path| path.into_path().ok()) else {
        return Ok(None);
    };
    std::fs::write(&chosen, contents).map_err(|e| e.to_string())?;
    Ok(Some(chosen.to_string_lossy().into_owned()))
}

#[tauri::command]
fn blog_list() -> Vec<blogs::BlogSummary> {
    blogs::list_blogs(&data_dir())
}

#[tauri::command]
fn blog_save(blog: blogs::Blog) -> Result<blogs::BlogSummary, String> {
    blogs::save_blog(&data_dir(), &blog)
}

#[tauri::command]
fn blog_delete(id: String, trash_posts: bool) -> Result<(), String> {
    blogs::remove_blog(&data_dir(), &id, trash_posts)
}

#[tauri::command]
fn blog_post_count(id: String) -> Result<usize, String> {
    blogs::post_count(&data_dir(), &id)
}

#[tauri::command]
fn blog_set_secret(
    id: String,
    secret: String,
    value: String,
) -> Result<blogs::BlogSummary, String> {
    blogs::set_blog_secret(&data_dir(), &id, &secret, &value)
}

#[tauri::command]
fn blog_can_store_secrets() -> bool {
    blogs::can_store_secrets()
}

#[tauri::command]
fn blog_last_synced() -> std::collections::BTreeMap<String, f64> {
    publish_state::last_synced(&data_dir())
}

/// The blog the renderer named, or nothing doing. Every command below takes
/// an id and acts on one of the reader's own blogs, never on a path.
fn blog_by_id(id: &str) -> Result<blogs::Blog, String> {
    blogs::list_blogs(&data_dir())
        .into_iter()
        .find(|blog| blog.blog.id == id)
        .map(|summary| summary.blog)
        .ok_or_else(|| "That blog no longer exists".to_string())
}

fn now_ms() -> f64 {
    chrono::Local::now().timestamp_millis() as f64
}

#[tauri::command]
fn blog_sync(id: String) -> Result<sync::SyncResult, String> {
    sync::sync_blog(
        &github::Api::default(),
        &data_dir(),
        &blog_by_id(&id)?,
        now_ms(),
    )
}

#[tauri::command]
fn blog_conflict(id: String, filename: String) -> Result<sync::ConflictVersions, String> {
    sync::conflict_versions(
        &github::Api::default(),
        &data_dir(),
        &blog_by_id(&id)?,
        &filename,
    )
}

#[tauri::command]
fn blog_resolve(id: String, filename: String, keep: String) -> Result<(), String> {
    let api = github::Api::default();
    let blog = blog_by_id(&id)?;

    // Refused rather than defaulted. Defaulting to "remote" would mean a typo
    // overwrites the copy that is here, which is the one of the two that only
    // exists in one place.
    match keep.as_str() {
        "local" => sync::keep_local(&api, &data_dir(), &blog, &filename),
        "remote" => sync::take_remote(&api, &data_dir(), &blog, &filename),
        other => Err(format!("Unknown choice: {other}")),
    }
}

#[tauri::command]
fn blog_delete_post(id: String, filename: String, also_remote: bool) -> Result<(), String> {
    sync::delete_post(
        &github::Api::default(),
        &data_dir(),
        &blog_by_id(&id)?,
        &filename,
        also_remote,
    )
}

/*
 * One publish, on a thread of its own, reporting as it goes.
 *
 * The Electron handler sends each update to the window that asked; here it is
 * emitted to the app, which has one window. The name is the same, so the
 * renderer's listener does not know the difference.
 */
#[tauri::command]
async fn publish_start(
    app: tauri::AppHandle,
    request: publisher::PublishRequest,
) -> Result<publisher::PublishUpdate, String> {
    use tauri::Emitter;

    tauri::async_runtime::spawn_blocking(move || {
        let world = publisher::World {
            contents: &github::Api::default(),
            deploys: &deploys::Api::default(),
            data_dir: &data_dir(),
            today: date::today(),
            now: &now_ms,
            sleep: &|ms: f64| std::thread::sleep(std::time::Duration::from_millis(ms as u64)),
        };

        publisher::publish(&world, &request, &mut |update| {
            let _ = app.emit("publish:update", update);
        })
    })
    .await
    .map_err(|e| e.to_string())
}

/// One file from the reader, or nothing if they thought better of it.
fn pick_file(
    app: &tauri::AppHandle,
    title: &str,
    kind: &str,
    extensions: &[&str],
) -> Option<PathBuf> {
    use tauri_plugin_dialog::DialogExt;

    app.dialog()
        .file()
        .set_title(title)
        .add_filter(kind, extensions)
        .blocking_pick_file()
        .and_then(|chosen| chosen.into_path().ok())
}

fn backgrounds_dir(theme: &str) -> PathBuf {
    // A folder each, as the bundled photographs have. The reader picks a
    // picture by clicking the + in one row or the other, which says which mode
    // they meant it for — a bright sky cannot carry white text, and the
    // reverse. Anything but "dark" is light, the way the handler reads it.
    let theme = if theme == "dark" { "dark" } else { "light" };
    data_dir().join("backgrounds").join(theme)
}

fn fonts_dir() -> PathBuf {
    data_dir().join("fonts")
}

#[tauri::command]
fn background_list(theme: String) -> Vec<String> {
    media::list_in(&backgrounds_dir(&theme), &media::BACKGROUND_KINDS)
}

#[tauri::command]
async fn background_add(app: tauri::AppHandle, theme: String) -> Result<Option<String>, String> {
    let Some(source) = pick_file(
        &app,
        "Add a background",
        "Images",
        &["png", "jpg", "jpeg", "webp"],
    ) else {
        return Ok(None);
    };

    // Unique across both folders, not just this one: a stored preference is a
    // bare filename, so two pictures sharing a name would be one answer to two
    // questions.
    let mut taken = media::list_in(&backgrounds_dir("light"), &media::BACKGROUND_KINDS);
    taken.extend(media::list_in(
        &backgrounds_dir("dark"),
        &media::BACKGROUND_KINDS,
    ));

    media::copy_in(
        &source,
        &backgrounds_dir(&theme),
        &media::BACKGROUND_KINDS,
        "background",
        &taken,
    )
    .map(Some)
}

#[tauri::command]
fn font_list() -> Vec<String> {
    media::list_in(&fonts_dir(), &media::FONT_KINDS)
}

#[tauri::command]
async fn font_add(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(source) = pick_file(
        &app,
        "Add a title font",
        "Fonts",
        &["otf", "ttf", "woff", "woff2"],
    ) else {
        return Ok(None);
    };

    let taken = media::list_in(&fonts_dir(), &media::FONT_KINDS);
    media::copy_in(
        &source,
        &fonts_dir(),
        &media::FONT_KINDS,
        "title-font",
        &taken,
    )
    .map(Some)
}

/// Removes an added face. Bundled ones are not files and never reach here.
#[tauri::command]
fn font_remove(name: String) -> Result<(), String> {
    std::fs::remove_file(media::resolve_within(&fonts_dir(), &name)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn font_url(name: String) -> Option<String> {
    media::resolve_within(&fonts_dir(), &name)
        .ok()
        .and_then(|path| media::data_url(&path))
}

#[tauri::command]
async fn prefs_choose_avatar(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(source) = pick_file(
        &app,
        "Choose a picture",
        "Images",
        &["png", "jpg", "jpeg", "webp"],
    ) else {
        return Ok(None);
    };

    let extension = source
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default();
    if !media::BACKGROUND_KINDS.contains(&extension.as_str()) {
        return Err(format!("Tova cannot use {extension} for an avatar"));
    }

    // A fixed name per format, so replacing a picture never leaves the old one.
    let filename = format!("avatar{extension}");
    std::fs::copy(&source, data_dir().join(&filename)).map_err(|e| e.to_string())?;

    // Chosen as well as copied: nobody picks a picture in order to not use it.
    let mut stored = preferences::read(&data_dir());
    stored.avatar = "custom".into();
    stored.avatar_file = Some(filename.clone());
    let value = serde_json::to_value(&stored).map_err(|e| e.to_string())?;
    preferences::write_value(&data_dir(), &value);

    Ok(Some(filename))
}

#[derive(Serialize)]
struct AvatarSources {
    system: Option<String>,
    custom: Option<String>,
}

/*
 * The macOS account picture. It lives in the directory service as a hex blob
 * under JPEGPhoto — the `Picture` attribute beside it often names a stock image
 * even when the user has set their own, so the blob is the honest source.
 */
#[cfg(target_os = "macos")]
fn mac_account_photo() -> Option<Vec<u8>> {
    // The absolute path because a packaged app's PATH is not a shell's and
    // need not have /usr/bin in it. No shell at all: the username goes in as
    // an argument, not as text something else will parse.
    let user = std::env::var("USER").ok()?;
    let output = std::process::Command::new("/usr/bin/dscl")
        .args([".", "-read", &format!("/Users/{user}"), "JPEGPhoto"])
        .output()
        .inspect_err(|e| {
            // Said out loud, because a silent None here is indistinguishable
            // from a Mac with no picture set, and the option simply not
            // appearing is a poor way to find out that reading it failed.
            eprintln!("Account picture could not be read: {e}");
        })
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // dscl says so in its output rather than its exit code, and an account
    // with no picture set is an ordinary thing, not a fault.
    if stdout.lines().any(|line| line.starts_with("No such key:")) {
        return None;
    }

    let hex: String = stdout
        .trim_start_matches("JPEGPhoto:")
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if hex.len() < 8 || !hex.len().is_multiple_of(2) {
        eprintln!(
            "Account picture: {} hex digits, which is not a picture.",
            hex.len()
        );
        return None;
    }

    let bytes: Option<Vec<u8>> = (0..hex.len())
        .step_by(2)
        .map(|at| u8::from_str_radix(&hex[at..at + 2], 16).ok())
        .collect();
    let bytes = bytes?;

    // FFD8 opens every JPEG; anything else is not a picture we should draw.
    if bytes.starts_with(&[0xff, 0xd8]) {
        return Some(bytes);
    }
    eprintln!("Account picture: read something that does not open like a JPEG.");
    None
}

#[cfg(not(target_os = "macos"))]
fn mac_account_photo() -> Option<Vec<u8>> {
    None
}

/// Both fetched pictures, whichever is in use.
///
/// Both, because the picker draws every option as the face it would give you,
/// and one call rather than two because they are read together at load. Data
/// URLs: neither file is under the vault, so the asset protocol does not reach
/// them, and both are small images read once.
#[tauri::command]
fn prefs_avatar_sources() -> AvatarSources {
    use base64::Engine;

    AvatarSources {
        system: mac_account_photo().map(|photo| {
            format!(
                "data:image/jpeg;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(photo)
            )
        }),
        custom: preferences::read(&data_dir())
            .avatar_file
            .and_then(|file| media::resolve_within(&data_dir(), &file).ok())
            .and_then(|path| media::data_url(&path)),
    }
}

#[tauri::command]
fn settings_reset() -> Result<(), String> {
    settings::reset_preferences(&data_dir())
}

#[tauri::command]
fn settings_nuke_targets() -> Vec<String> {
    settings::nuke_targets(&data_dir())
}

/// The app restarts rather than carrying on: every path it holds open has just
/// been deleted underneath it, and a fresh start is the honest next state.
#[tauri::command]
fn settings_nuke(app: tauri::AppHandle) {
    settings::nuke_everything(&data_dir());
    app.restart();
}

/// Only the two vault directories are ever revealed — the renderer names which
/// one, never a path.
#[tauri::command]
fn app_reveal(app: tauri::AppHandle, target: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let path = if target == "backups" {
        backup::backup_root()
    } else {
        vault::vault_root()
    };
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Only http(s) is ever opened, and only in the OS browser — a renderer that
/// could hand any string to the shell could open a file or a script.
#[tauri::command]
fn app_open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(format!("Refusing to open {}: links", parsed.scheme()));
    }
    app.opener()
        .open_url(parsed.to_string(), None::<&str>)
        .map_err(|e| e.to_string())
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
        .plugin(tauri_plugin_opener::init())
        /*
         * Pictures a note holds, and backgrounds the reader added.
         *
         * Two schemes rather than one with a path prefix, so neither handler
         * can ever be talked into serving the other's files: the vault's is
         * the vault's, and userData is userData.
         */
        .register_uri_scheme_protocol("tova-asset", |_ctx, request| {
            images::serve_asset(request.uri())
        })
        .register_uri_scheme_protocol("tova-bg", |_ctx, request| {
            images::serve_background(&data_dir(), request.uri())
        })
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
            vault_unlock,
            note_list,
            note_read,
            note_create,
            note_write,
            note_rename,
            note_favorite,
            note_tags,
            note_versions,
            note_version_read,
            note_move,
            note_remove,
            note_restore,
            note_permanent_delete,
            folder_list,
            folder_create,
            folder_rename,
            folder_delete,
            section_create,
            section_delete,
            note_search,
            note_today,
            backup_run,
            backup_list,
            backup_restore,
            backup_status,
            background_list,
            background_add,
            font_list,
            font_add,
            font_remove,
            font_url,
            prefs_choose_avatar,
            prefs_avatar_sources,
            settings_reset,
            settings_nuke_targets,
            settings_nuke,
            app_reveal,
            app_open_external,
            image_save,
            note_export,
            blog_list,
            blog_save,
            blog_delete,
            blog_post_count,
            blog_set_secret,
            blog_can_store_secrets,
            blog_last_synced,
            blog_sync,
            blog_conflict,
            blog_resolve,
            blog_delete_post,
            publish_start
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
