/*!
The pictures and faces a reader adds — a port of `src/main/backgrounds.ts`,
`titleFonts.ts` and `avatar.ts`.

Three files in the TypeScript, one here, because they are the same shape three
times over: a directory beside the app, a list of allowed extensions, a choke
point that turns a stored filename into a path, and a copy-in that keeps names
unique. Writing that once and passing the differences in is what makes it
obvious that the guard is the same guard in all three.

Copied rather than referenced throughout: a background or a title face that
vanishes because the original was moved out of Downloads is a worse surprise
than the disk it costs.
*/

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use std::path::{Path, PathBuf};

use crate::note_name::slugify;

pub const BACKGROUND_KINDS: [&str; 4] = [".png", ".jpg", ".jpeg", ".webp"];
/// What a browser engine will actually decode. `.otf` and `.ttf` cover what
/// people have on disk; woff2 covers what they downloaded from a foundry.
pub const FONT_KINDS: [&str; 4] = [".otf", ".ttf", ".woff", ".woff2"];

fn extension_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default()
}

/*
 * The single choke point for turning a stored filename into a path, the same
 * discipline the vault uses: a name that resolves outside the directory is
 * refused rather than clamped.
 */
pub fn resolve_within(root: &Path, name: &str) -> Result<PathBuf, String> {
    let target = crate::vault::normalize(&root.join(name));

    if !target.starts_with(root) || target == root {
        return Err("Refusing to read outside that directory".into());
    }
    Ok(target)
}

/// Filenames of the allowed kinds in a directory, in a stable order.
pub fn list_in(directory: &Path, kinds: &[&str]) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        // No directory yet simply means none have been added.
        return Vec::new();
    };

    let mut names: Vec<String> = entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| kinds.contains(&extension_of(name).as_str()))
        .collect();
    names.sort_by(|a, b| crate::js::compare(a, b));
    names
}

/// Copies a chosen file in under a name nothing else is using.
///
/// `taken` is passed rather than read from `directory`, because backgrounds
/// need names unique across two folders and not one: a stored preference is a
/// bare filename, so two pictures sharing a name would be one answer to two
/// questions.
pub fn copy_in(
    source: &Path,
    directory: &Path,
    kinds: &[&str],
    fallback: &str,
    taken: &[String],
) -> Result<String, String> {
    let extension = extension_of(&source.to_string_lossy());
    if !kinds.contains(&extension.as_str()) {
        return Err(format!("Tova cannot use {extension} for that"));
    }

    let stem = source
        .file_stem()
        .map(|s| slugify(&s.to_string_lossy()))
        .unwrap_or_else(|| fallback.to_string());
    let stem = if stem.is_empty() { fallback } else { &stem };

    // A second file of the same name is a different picture, not a replacement.
    let mut filename = format!("{stem}{extension}");
    let mut n = 2;
    while taken.contains(&filename) {
        filename = format!("{stem}-{n}{extension}");
        n += 1;
    }

    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    std::fs::copy(source, resolve_within(directory, &filename)?).map_err(|e| e.to_string())?;
    Ok(filename)
}

fn mime_of(extension: &str) -> &'static str {
    match extension {
        ".jpg" | ".jpeg" => "image/jpeg",
        ".webp" => "image/webp",
        ".otf" => "font/otf",
        ".ttf" => "font/ttf",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        _ => "image/png",
    }
}

/*
 * A file as a data URL, or nothing when it is gone.
 *
 * Not a custom scheme, though that is how backgrounds are served: the renderer
 * runs from a file origin, and Chromium refuses cross-origin *font* requests
 * from there to any scheme but a handful of built-in ones — no response header
 * can lift that, because the blocked origin is the page's, not the font's.
 * Images are not fetched under CORS, which is why the backgrounds' scheme is
 * fine and this is what the fonts and the avatar get.
 */
pub fn data_url(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let mime = mime_of(&extension_of(&path.to_string_lossy()));
    Some(format!("data:{mime};base64,{}", B64.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tova-media-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_stored_name_that_climbs_out_of_the_directory_is_refused() {
        let root = Path::new("/Users/someone/Library/Application Support/tova/backgrounds/light");

        for name in [
            "../../../etc/passwd",
            "..",
            "../light-2/x.png",
            "/etc/passwd",
            "",
        ] {
            assert!(resolve_within(root, name).is_err(), "allowed {name:?}");
        }
        assert!(resolve_within(root, "sky.png").is_ok());
    }

    #[test]
    fn a_sibling_whose_name_starts_the_same_is_outside() {
        // `starts_with` compares components, so this is refused where a string
        // prefix would have let it through.
        let root = Path::new("/tmp/backgrounds");

        assert!(resolve_within(root, "../backgrounds-evil/x.png").is_err());
    }

    #[test]
    fn only_the_kinds_that_can_be_drawn_are_listed() {
        let dir = scratch("list");
        for name in ["a.png", "b.JPG", "c.webp", "notes.md", "d.svg", ".DS_Store"] {
            std::fs::write(dir.join(name), "x").unwrap();
        }

        assert_eq!(
            list_in(&dir, &BACKGROUND_KINDS),
            ["a.png", "b.JPG", "c.webp"]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_second_file_of_the_same_name_is_a_different_picture() {
        let dir = scratch("copy");
        let source = dir.join("Slow Morning.png");
        std::fs::write(&source, "picture").unwrap();
        let into = dir.join("backgrounds");

        let first = copy_in(&source, &into, &BACKGROUND_KINDS, "background", &[]).unwrap();
        let second = copy_in(
            &source,
            &into,
            &BACKGROUND_KINDS,
            "background",
            std::slice::from_ref(&first),
        )
        .unwrap();

        assert_eq!(first, "slow-morning.png");
        assert_eq!(second, "slow-morning-2.png");
        assert!(into.join(&second).is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_name_with_nothing_sluggable_in_it_still_gets_one() {
        /*
         * `untitled`, not `background`: slugify already has a fallback of its
         * own and never returns an empty string, which makes the one the
         * TypeScript spells `|| "background"` unreachable. Kept in the port
         * because removing it would be a guess about a caller that might one
         * day pass something slugify has not seen, and asserted here so the
         * next reader does not have to work out which fallback wins.
         */
        let dir = scratch("fallback");
        let source = dir.join("日本語.png");
        std::fs::write(&source, "picture").unwrap();

        let name = copy_in(
            &source,
            &dir.join("out"),
            &BACKGROUND_KINDS,
            "background",
            &[],
        )
        .unwrap();

        assert_eq!(name, "untitled.png");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_kind_that_cannot_be_drawn_is_refused() {
        let dir = scratch("kind");
        let source = dir.join("thing.svg");
        std::fs::write(&source, "<svg/>").unwrap();

        assert!(copy_in(&source, &dir, &BACKGROUND_KINDS, "background", &[]).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_data_url_says_what_it_holds() {
        let dir = scratch("dataurl");
        std::fs::write(dir.join("a.woff2"), "font bytes").unwrap();
        std::fs::write(dir.join("b.jpg"), "jpeg bytes").unwrap();

        assert!(data_url(&dir.join("a.woff2"))
            .unwrap()
            .starts_with("data:font/woff2;base64,"));
        assert!(data_url(&dir.join("b.jpg"))
            .unwrap()
            .starts_with("data:image/jpeg;base64,"));
        // Removed underneath us; the caller stands something else in.
        assert!(data_url(&dir.join("gone.png")).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
