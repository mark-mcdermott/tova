/*!
Where the notes are — a port of `src/main/vault.ts`.

The important part of this file is `resolve_in_vault`: the single choke point
for turning renderer-supplied strings into paths. Everything the renderer sends
is untrusted, so a resolved path that escapes the vault is refused outright
rather than clamped.
*/

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use crate::note_location::{parse_note_id, to_note_id, NoteLocation};

/// Posts is not a configurable section: the blogs that sync into it own it.
const ALWAYS: [&str; 1] = ["posts"];

/// Where a vault lives unless the reader has chosen another.
pub fn default_vault_root() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
        .join("Documents")
        .join("Tova")
}

/*
 * The vault in use. State, not a cache: the reader can hold several and switch
 * between them, so this has to be settable. It is set deliberately at startup
 * and on every switch rather than filled in by whichever call happened to run
 * first — which is the accident an earlier cache in the Electron side caused.
 *
 * A Mutex rather than the `let active` the TypeScript can get away with: every
 * command here may run on its own thread, and the one thing worse than a stale
 * vault root is two of them.
 */
static ACTIVE: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_active_vault(path: Option<PathBuf>) {
    if let Ok(mut active) = ACTIVE.lock() {
        *active = path;
    }
}

/// Read by everything that touches a file in the vault.
pub fn vault_root() -> PathBuf {
    ACTIVE
        .lock()
        .ok()
        .and_then(|active| active.clone())
        .unwrap_or_else(default_vault_root)
}

/*
 * Tests that switch the vault in use are touching the state above, and there
 * is one of it per test binary rather than one per test. This is the lock they
 * take, and it lives here because the state does — a second copy in some other
 * module would not exclude anything.
 */
#[cfg(test)]
pub fn one_at_a_time() -> std::sync::MutexGuard<'static, ()> {
    static ORDER: Mutex<()> = Mutex::new(());
    ORDER.lock().unwrap_or_else(|e| e.into_inner())
}

/// `path.resolve` of one absolute path: `.` dropped, `..` applied. Lexical,
/// so the answer does not depend on what happens to exist on disk.
pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Lexical resolution, which is what `path.resolve` does and what the guard
/// below needs: the answer must not depend on what happens to exist on disk,
/// or a symlink could decide whether a path is inside the vault.
fn resolve_lexically(root: &Path, relative: &str) -> PathBuf {
    let joined = root.join(relative);
    let mut out = PathBuf::new();

    for part in joined.components() {
        match part {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// The guard itself, against a root it is handed.
///
/// Separate from `resolve_in_vault` so it can be tested without the vault in
/// use being global state — and because a guard that can only be exercised
/// through a mutex is a guard that will be exercised less.
pub fn resolve_within(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let target = resolve_lexically(root, relative);

    // `starts_with` compares components, not characters, so a sibling named
    // `Tova-evil` is outside a vault named `Tova` — which a string prefix
    // would have let through.
    if target != root && !target.starts_with(root) {
        return Err("Refusing to touch a path outside the vault".into());
    }
    Ok(target)
}

/// The single choke point. A path that escapes is refused, not clamped.
pub fn resolve_in_vault(relative: &str) -> Result<PathBuf, String> {
    resolve_within(&vault_root(), relative)
}

/// The choke point with the error the command layer hands back. Every entry
/// point that takes an id from the renderer goes through here.
pub fn require_location(id: &str) -> Result<NoteLocation, String> {
    parse_note_id(id).ok_or_else(|| format!("Invalid note id: {id}"))
}

pub fn note_path(location: &NoteLocation) -> Result<PathBuf, String> {
    resolve_in_vault(&to_note_id(location))
}

pub fn directory_of(section: &str, folder: Option<&str>) -> Result<PathBuf, String> {
    let relative = match folder {
        None => section.to_string(),
        Some(folder) => format!("{section}/{folder}"),
    };
    resolve_in_vault(&relative)
}

/// The section directories a vault is expected to have, made if they are not.
/*
 * A vault's name for itself.
 *
 * Backups are folders named after the minute they were taken, and said
 * nothing about where they came from — so anything sweeping them had to treat
 * every snapshot on the machine as possibly this vault's. Recording the
 * vault's path would have worked until the vault moved, and then every older
 * snapshot would look like a stranger's.
 *
 * An id written inside the vault moves with it, and a backup is a copy of the
 * vault, so every snapshot carries one without anything having to put it
 * there. Restoring one brings the same id back, which is right: it is the
 * same vault.
 *
 * Hidden, and not a section, so nothing that walks the vault for notes sees
 * it.
 */
const IDENTITY: &str = ".tova-vault";

/// The id recorded in a directory, without making one. For reading a backup
/// snapshot, which is a copy of a vault and must not be written to.
pub fn identity_of(root: &Path) -> Option<String> {
    let found = std::fs::read_to_string(root.join(IDENTITY)).ok()?;
    let found = crate::js::trim(&found).to_string();
    (!found.is_empty()).then_some(found)
}

/// The vault's id, making one if this vault has never had one.
///
/// A vault with no id is not an error: every vault predating this had none,
/// and one is written the next time the app opens it.
pub fn identity(root: &Path) -> Option<String> {
    if let Some(existing) = identity_of(root) {
        return Some(existing);
    }

    let path = root.join(IDENTITY);
    let made = uuid::Uuid::new_v4().to_string();
    std::fs::write(&path, &made).ok().map(|()| made)
}

pub fn ensure_vault(root: &Path, sections: &[String]) -> std::io::Result<()> {
    let mut wanted: Vec<&str> = sections.iter().map(String::as_str).collect();
    wanted.extend(ALWAYS);
    wanted.sort_unstable();
    wanted.dedup();

    for section in wanted {
        std::fs::create_dir_all(root.join(section))?;
    }

    // After the directories exist, so the first run writes into a vault
    // rather than making one by accident.
    identity(root);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * Every vault gets a name the first time the app opens it, which is what
     * lets a backup say which vault it came from. Written into the vault
     * rather than recorded beside it, so it survives the vault being moved.
     */
    #[test]
    fn opening_a_vault_gives_it_a_name_and_keeps_it() {
        let vault = std::env::temp_dir().join("tova-vault-identity");
        let _ = std::fs::remove_dir_all(&vault);
        std::fs::create_dir_all(&vault).unwrap();

        assert_eq!(identity_of(&vault), None, "nothing there to begin with");

        ensure_vault(&vault, &[]).unwrap();
        let named = identity_of(&vault).expect("a name after opening");
        assert!(!named.is_empty());

        ensure_vault(&vault, &[]).unwrap();
        assert_eq!(identity_of(&vault), Some(named), "and it is not renamed");

        let _ = std::fs::remove_dir_all(&vault);
    }

    #[test]
    fn two_vaults_are_not_given_the_same_name() {
        let roots: Vec<std::path::PathBuf> = ["tova-vault-one", "tova-vault-two"]
            .iter()
            .map(|name| {
                let path = std::env::temp_dir().join(name);
                let _ = std::fs::remove_dir_all(&path);
                std::fs::create_dir_all(&path).unwrap();
                ensure_vault(&path, &[]).unwrap();
                path
            })
            .collect();

        assert_ne!(identity_of(&roots[0]), identity_of(&roots[1]));
        for path in roots {
            let _ = std::fs::remove_dir_all(&path);
        }
    }

    fn root() -> PathBuf {
        PathBuf::from("/Users/someone/Documents/Tova")
    }

    fn resolved(relative: &str) -> Result<PathBuf, String> {
        resolve_within(&root(), relative)
    }

    #[test]
    fn resolves_a_path_inside_the_vault() {
        assert_eq!(
            resolved("notes/slow-morning.md"),
            Ok(root().join("notes/slow-morning.md"))
        );
    }

    #[test]
    fn the_root_itself_is_inside_it() {
        assert_eq!(resolved(""), Ok(root()));
        assert_eq!(resolved("."), Ok(root()));
    }

    #[test]
    fn refuses_a_path_that_climbs_out() {
        assert!(resolved("../escape.md").is_err());
        assert!(resolved("notes/../../escape.md").is_err());
        assert!(resolved("../../../../etc/passwd").is_err());
    }

    #[test]
    fn refuses_an_absolute_path_outright() {
        // `join` on an absolute path replaces the root, the way path.resolve
        // does — so this has to be caught by the guard rather than by joining.
        assert!(resolved("/etc/passwd").is_err());
    }

    #[test]
    fn refuses_a_sibling_whose_name_merely_starts_the_same() {
        // The string prefix test this replaces would have allowed it:
        // "/…/Tova-evil/x" does begin with "/…/Tova".
        assert!(resolve_within(&root(), "../Tova-evil/notes.md").is_err());
    }

    #[test]
    fn climbs_back_in_without_complaint() {
        // Ugly, but inside. Refusing it would refuse a path that names a real
        // place in the vault.
        assert_eq!(
            resolved("notes/../daily/today.md"),
            Ok(root().join("daily/today.md"))
        );
    }

    #[test]
    fn makes_the_sections_a_vault_is_expected_to_have() {
        let dir = std::env::temp_dir().join(format!("tova-vault-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        ensure_vault(&dir, &["notes".into(), "daily".into(), "notes".into()]).unwrap();

        assert!(dir.join("notes").is_dir());
        assert!(dir.join("daily").is_dir());
        // Posts is not a configurable section; the blogs that sync into it own it.
        assert!(dir.join("posts").is_dir());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
