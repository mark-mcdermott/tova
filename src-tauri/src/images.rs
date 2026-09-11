/*!
Images dropped into a note — a port of `src/main/images.ts`, and of the two
custom schemes in `index.ts` that serve them back.

The write and the read are here together because they are two halves of one
decision: what a note may hold, and what the renderer may ask for. Neither is
allowed to trust a string from the other side.
*/

use std::borrow::Cow;
use std::path::Path;

use crate::note_name::{slugify, unique_slug};
use crate::vault::resolve_in_vault;
use crate::vault_file::{read_vault_bytes, write_vault_bytes};

/// Where images dropped into a note are kept, relative to the vault root.
const ASSETS_DIRECTORY: &str = "assets";

/// Extensions the webview renders inline. Anything else is refused rather than
/// written into the vault under a name that implies it will display.
const IMAGE_EXTENSIONS: [&str; 7] = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];

/// Generous enough for a camera original, small enough that a stray drop of a
/// disk image cannot fill the vault.
const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;

fn extension_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default()
}

/// Writes a dropped image into the vault's assets directory and returns its
/// vault-relative path. The supplied name is untrusted: only its extension is
/// honoured, and the stem is reduced to a slug, so nothing the renderer sends
/// can steer the write.
pub fn save_image(name: &str, bytes: &[u8]) -> Result<String, String> {
    // The stored name is normalised to lower case, but the stem has to be
    // split off using the extension as it actually appears, or `photo.PNG`
    // keeps it.
    let suffix = extension_of(name);
    let extension = suffix.to_lowercase();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        let what = if extension.is_empty() {
            name
        } else {
            &extension
        };
        return Err(format!("Tova cannot store {what} files"));
    }
    if bytes.is_empty() {
        return Err("That image is empty".into());
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("That image is too large for the vault".into());
    }

    let directory = resolve_in_vault(ASSETS_DIRECTORY)?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;

    // Stems are compared without their extension, so a second `photo` lands as
    // `photo-2` even when the two files are different formats.
    let taken: Vec<String> = std::fs::read_dir(&directory)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| {
                    Path::new(&entry.file_name())
                        .file_stem()
                        .map(|s| s.to_string_lossy().into_owned())
                })
                .collect()
        })
        .unwrap_or_default();

    let base = Path::new(name)
        .file_stem()
        .map(|s| slugify(&s.to_string_lossy()))
        .unwrap_or_else(|| "untitled".into());
    let stem = unique_slug(&base, taken.iter().map(String::as_str));
    let filename = format!("{stem}{extension}");

    write_vault_bytes(&directory.join(&filename), bytes)?;
    Ok(format!("{ASSETS_DIRECTORY}/{filename}"))
}

/// Enough of a table for what a note can hold; anything else is served raw.
fn mime_of(file: &str) -> &'static str {
    match extension_of(file).to_lowercase().as_str() {
        ".png" => "image/png",
        ".jpg" | ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".avif" => "image/avif",
        ".svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn not_found() -> http::Response<Cow<'static, [u8]>> {
    http::Response::builder()
        .status(404)
        .body(Cow::Borrowed(&[][..]))
        .expect("a 404 with no body")
}

fn served(bytes: Vec<u8>, mime: &str) -> http::Response<Cow<'static, [u8]>> {
    http::Response::builder()
        .header("content-type", mime)
        .body(Cow::Owned(bytes))
        .unwrap_or_else(|_| not_found())
}

/// The path a custom-scheme URL names, percent-decoded and with its leading
/// slashes off. Everything after this goes through the vault's own guard.
fn requested(uri: &http::Uri) -> String {
    percent_decode(uri.path().trim_start_matches('/'))
}

fn percent_decode(value: &str) -> String {
    let raw = value.as_bytes();
    let mut out = Vec::with_capacity(raw.len());
    let mut at = 0;

    while at < raw.len() {
        let decoded = (raw[at] == b'%' && at + 2 < raw.len())
            .then(|| {
                std::str::from_utf8(&raw[at + 1..at + 3])
                    .ok()
                    .and_then(|pair| u8::from_str_radix(pair, 16).ok())
            })
            .flatten();

        match decoded {
            Some(byte) => {
                out.push(byte);
                at += 3;
            }
            None => {
                out.push(raw[at]);
                at += 1;
            }
        }
    }

    String::from_utf8_lossy(&out).into_owned()
}

/// Serves a picture out of the vault.
///
/// Read rather than fetched: in an encrypted vault the bytes on disk are a
/// sealed envelope, and the picture is what comes out of it. A missing or
/// out-of-vault asset is a broken image, never an app error.
pub fn serve_asset(uri: &http::Uri) -> http::Response<Cow<'static, [u8]>> {
    let Ok(file) = resolve_in_vault(&requested(uri)) else {
        return not_found();
    };
    match read_vault_bytes(&file) {
        Ok(bytes) => served(bytes, mime_of(&file.to_string_lossy())),
        Err(_) => not_found(),
    }
}

/*
 * The same window for backgrounds, onto a different directory. A separate
 * scheme rather than a path prefix on the vault's, so neither handler can ever
 * be talked into serving the other's files.
 */
pub fn serve_background(data_dir: &Path, uri: &http::Uri) -> http::Response<Cow<'static, [u8]>> {
    // By name alone: a stored preference is a bare filename, so which of the
    // two folders holds it is this side's problem rather than the URL's.
    let name = requested(uri);
    let root = data_dir.join("backgrounds");

    for theme in ["light", "dark"] {
        let directory = root.join(theme);
        if !crate::media::list_in(&directory, &crate::media::BACKGROUND_KINDS).contains(&name) {
            continue;
        }
        let Ok(file) = crate::media::resolve_within(&directory, &name) else {
            continue;
        };
        if let Ok(bytes) = std::fs::read(&file) {
            return served(bytes, mime_of(&name));
        }
    }

    not_found()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{one_at_a_time, set_active_vault};

    struct Scratch {
        vault: std::path::PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            let vault = std::env::temp_dir().join(format!("tova-images-{name}"));
            let _ = std::fs::remove_dir_all(&vault);
            std::fs::create_dir_all(vault.join("notes")).unwrap();
            set_active_vault(Some(vault.clone()));
            Self { vault, _held: held }
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(&self.vault);
        }
    }

    const PNG: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    fn uri(path: &str) -> http::Uri {
        format!("tova-asset://localhost/{path}").parse().unwrap()
    }

    #[test]
    fn a_dropped_image_lands_in_the_assets_directory_under_a_slug() {
        let s = Scratch::new("save");

        let path = save_image("Slow Morning.PNG", &PNG).unwrap();

        assert_eq!(path, "assets/slow-morning.png");
        assert!(s.vault.join(&path).is_file());
    }

    #[test]
    fn a_second_image_of_the_same_name_does_not_replace_the_first() {
        // Compared without the extension, so a second `photo` lands as
        // `photo-2` even when the two files are different formats.
        let _s = Scratch::new("clash");
        save_image("photo.png", &PNG).unwrap();

        assert_eq!(save_image("photo.jpg", &PNG).unwrap(), "assets/photo-2.jpg");
    }

    #[test]
    fn nothing_the_renderer_sends_can_steer_the_write() {
        let s = Scratch::new("steer");

        let path = save_image("../../../etc/passwd.png", &PNG).unwrap();

        // Only the last segment survives, and only as a slug: the directories
        // in the name are gone before anything is resolved, which is what
        // `basename` does on the other side too.
        assert_eq!(path, "assets/passwd.png");
        assert!(s.vault.join("assets/passwd.png").is_file());
        assert!(!Path::new("/etc/passwd.png").exists());
    }

    #[test]
    fn a_kind_the_webview_cannot_draw_is_refused() {
        let _s = Scratch::new("kind");

        for name in ["thing.pdf", "thing.exe", "thing", "thing.html"] {
            assert!(save_image(name, &PNG).is_err(), "stored {name:?}");
        }
    }

    #[test]
    fn an_empty_or_enormous_image_is_refused() {
        let _s = Scratch::new("size");

        assert!(save_image("a.png", &[]).is_err());
        assert!(save_image("a.png", &vec![0u8; MAX_IMAGE_BYTES + 1]).is_err());
    }

    #[test]
    fn the_asset_scheme_serves_what_is_in_the_vault_and_says_what_it_is() {
        let _s = Scratch::new("serve");
        let path = save_image("photo.png", &PNG).unwrap();

        let response = serve_asset(&uri(&path));

        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["content-type"], "image/png");
        assert_eq!(response.body().as_ref(), &PNG);
    }

    #[test]
    fn the_asset_scheme_decodes_a_name_that_had_to_be_escaped() {
        let _s = Scratch::new("escaped");
        save_image("photo.png", &PNG).unwrap();
        std::fs::rename(
            Path::new(&std::env::temp_dir()).join("tova-images-escaped/assets/photo.png"),
            Path::new(&std::env::temp_dir()).join("tova-images-escaped/assets/a b.png"),
        )
        .unwrap();

        assert_eq!(serve_asset(&uri("assets/a%20b.png")).status(), 200);
    }

    #[test]
    fn the_asset_scheme_refuses_to_climb_out_of_the_vault() {
        // A broken image, never an app error, and never a file outside.
        let _s = Scratch::new("climb");

        for path in [
            "../../../etc/passwd",
            "..%2f..%2fetc%2fpasswd",
            "assets/../../escape.md",
            "",
        ] {
            assert_eq!(serve_asset(&uri(path)).status(), 404, "served {path:?}");
        }
    }

    #[test]
    fn a_sealed_vault_serves_the_picture_rather_than_the_envelope() {
        /*
         * The reason this reads rather than fetches. On disk the bytes are a
         * sealed envelope; what the webview needs is what comes out of it.
         */
        let s = Scratch::new("sealed");
        let data = s.vault.join("data");
        std::fs::create_dir_all(&data).unwrap();
        save_image("photo.png", &PNG).unwrap();
        crate::vault_file::encrypt_vault(&data, &s.vault).unwrap();

        let raw = std::fs::read(s.vault.join("assets/photo.png")).unwrap();
        assert!(crate::crypto::looks_encrypted(&raw));

        let response = serve_asset(&uri("assets/photo.png"));
        assert_eq!(response.body().as_ref(), &PNG);
    }
}
