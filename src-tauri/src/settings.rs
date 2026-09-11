/*!
Reset and Nuke — a port of `src/main/reset.ts`.

The two destructive buttons in Settings. Reset puts the preferences back and
leaves every note alone. Nuke deletes the contents of every vault the reader
has added, wherever those live, and everything Tova stores about them.

`safe_to_delete` is the whole of the care in this file. A vault is a folder the
reader chose, and some of them choose badly.
*/

use std::path::{Path, PathBuf};

use crate::preferences;
use crate::vault::{default_vault_root, ensure_vault, set_active_vault};

/*
 * Everything Tova keeps about a reader, by name. Enumerated rather than the
 * whole of the data directory: the webview keeps its own state in there, and
 * pulling that out from under a running app is a different and worse kind of
 * reset.
 */
const APP_FILES: [&str; 10] = [
    "preferences.json",
    "session.json",
    "window.json",
    "blogs.json",
    "publish-timing.json",
    "blog-sync.json",
    "avatar.jpg",
    "avatar.jpeg",
    "avatar.png",
    "avatar.webp",
];

const APP_FOLDERS: [&str; 2] = ["fonts", "backgrounds"];

/// Preferences back to what a fresh install has, and the default vault back in
/// use. The notes are not touched — a vault that is forgotten here is still a
/// folder full of files, and adding it again brings it back.
pub fn reset_preferences(data_dir: &Path) -> Result<(), String> {
    let defaults =
        serde_json::to_value(preferences::Preferences::default()).map_err(|e| e.to_string())?;
    let stored = preferences::write_value(data_dir, &defaults);

    set_active_vault(None);
    let sections: Vec<String> = stored.sections.iter().map(|s| s.id.clone()).collect();
    let _ = ensure_vault(&default_vault_root(), &sections);
    Ok(())
}

/*
 * A path Tova is willing to delete outright.
 *
 * A vault is a folder the reader chose, and some of them choose badly — a home
 * directory, or the whole of Documents. Deleting one of those because it was
 * once added as a vault is not something to find out about afterwards, so
 * anything at or above the home directory is refused.
 */
fn safe_to_delete(path: &Path) -> bool {
    /*
     * Normalised first, which is not a formality. `path.resolve` does it on
     * the TypeScript side, and without it a vault recorded as
     * `/Users/someone/..` reads as four components that are not the home
     * directory — and is Users, which is the one thing this is here to refuse.
     */
    let path = crate::vault::normalize(path);
    let home = crate::vault::normalize(&PathBuf::from(std::env::var("HOME").unwrap_or_default()));

    if path == home || home.starts_with(&path) {
        return false;
    }
    // Two components below the root at the very least, so "/" and "/Users" go
    // too. `components` counts the root itself, hence three.
    path.components().count() >= 3
}

#[cfg(test)]
mod guard {
    use super::safe_to_delete;
    use std::path::Path;

    #[test]
    fn refuses_a_path_that_climbs_back_up_to_something_it_must_not_touch() {
        // The case the TypeScript's `resolve` handles and a literal component
        // comparison does not: this is `/Users`, written the long way.
        let home = std::env::var("HOME").unwrap();

        assert!(!safe_to_delete(Path::new(&format!("{home}/.."))));
        assert!(!safe_to_delete(Path::new(&format!("{home}/../.."))));
        assert!(!safe_to_delete(Path::new(&format!(
            "{home}/Documents/../.."
        ))));
        // And still allows the ordinary thing, written the long way too.
        assert!(safe_to_delete(Path::new(&format!(
            "{home}/Documents/../Documents/Tova"
        ))));
    }
}

/// Every vault Tova knows of, the default one included.
fn vault_roots(data_dir: &Path) -> Vec<PathBuf> {
    let stored = preferences::read(data_dir);
    let mut roots = vec![default_vault_root()];
    for path in stored.vaults.iter().map(PathBuf::from) {
        if !roots.contains(&path) {
            roots.push(path);
        }
    }
    roots
}

/// What a nuke would delete, so the confirm can name it rather than gesture.
pub fn nuke_targets(data_dir: &Path) -> Vec<String> {
    vault_roots(data_dir)
        .into_iter()
        .filter(|root| safe_to_delete(root))
        .chain([data_dir.to_path_buf()])
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

/// Every note in every vault, and everything Tova stores about the reader —
/// settings, session, the pictures and faces they added, and the blog tokens,
/// which are ciphertext inside blogs.json and go with it.
pub fn nuke_everything(data_dir: &Path) {
    for root in vault_roots(data_dir) {
        if safe_to_delete(&root) {
            let _ = std::fs::remove_dir_all(&root);
        }
    }

    for name in APP_FILES {
        let _ = std::fs::remove_file(data_dir.join(name));
    }
    for name in APP_FOLDERS {
        let _ = std::fs::remove_dir_all(data_dir.join(name));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::one_at_a_time;

    struct Scratch {
        data: PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            let data = std::env::temp_dir().join(format!("tova-settings-{name}"));
            let _ = std::fs::remove_dir_all(&data);
            std::fs::create_dir_all(&data).unwrap();
            set_active_vault(None);
            Self { data, _held: held }
        }

        fn with_vaults(&self, vaults: &[&str]) {
            let stored = preferences::Preferences {
                vaults: vaults.iter().map(|v| v.to_string()).collect(),
                ..Default::default()
            };
            let value = serde_json::to_value(&stored).unwrap();
            preferences::write_value(&self.data, &value);
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(&self.data);
        }
    }

    fn home() -> PathBuf {
        PathBuf::from(std::env::var("HOME").unwrap())
    }

    #[test]
    fn a_nuke_names_the_default_vault_and_the_apps_own_directory() {
        let s = Scratch::new("targets");
        s.with_vaults(&[]);

        assert_eq!(
            nuke_targets(&s.data),
            [
                default_vault_root().to_string_lossy().into_owned(),
                s.data.to_string_lossy().into_owned()
            ]
        );
    }

    #[test]
    fn a_nuke_names_every_vault_that_has_been_added() {
        let s = Scratch::new("added");
        let elsewhere = s.data.join("another-vault");
        s.with_vaults(&[elsewhere.to_str().unwrap()]);

        assert!(nuke_targets(&s.data).contains(&elsewhere.to_string_lossy().into_owned()));
    }

    #[test]
    fn a_nuke_refuses_the_home_directory_however_it_came_to_be_a_vault() {
        /*
         * A reader who once added their home as a vault should not lose it
         * here. Nothing about the button says "and everything else you own".
         */
        let s = Scratch::new("home");
        let home = home();
        s.with_vaults(&[home.to_str().unwrap()]);

        assert!(!nuke_targets(&s.data).contains(&home.to_string_lossy().into_owned()));
    }

    #[test]
    fn a_nuke_refuses_anything_above_the_home_directory() {
        let s = Scratch::new("above");
        let documents = home().join("..").to_string_lossy().into_owned();
        s.with_vaults(&["/", "/Users", &documents]);

        let targets = nuke_targets(&s.data);

        assert!(!targets.contains(&"/".to_string()));
        assert!(!targets.contains(&"/Users".to_string()));
        assert!(!targets.iter().any(|t| t.ends_with("..")));
    }

    #[test]
    fn a_nuke_says_nothing_twice_when_a_vault_is_the_default_one() {
        let s = Scratch::new("dedupe");
        s.with_vaults(&[default_vault_root().to_str().unwrap()]);

        assert_eq!(nuke_targets(&s.data).len(), 2);
    }

    #[test]
    fn a_nuke_deletes_the_vaults_it_named_and_nothing_it_did_not() {
        let s = Scratch::new("nuke");
        let vault = s.data.join("a-vault");
        std::fs::create_dir_all(vault.join("notes")).unwrap();
        std::fs::write(vault.join("notes/gone.md"), "Coffee.").unwrap();
        let untouched = s.data.join("not-a-vault");
        std::fs::create_dir_all(&untouched).unwrap();
        std::fs::write(untouched.join("kept.md"), "Still here.").unwrap();
        s.with_vaults(&[vault.to_str().unwrap()]);

        nuke_everything(&s.data);

        assert!(!vault.exists());
        assert!(untouched.join("kept.md").is_file());
        assert!(!s.data.join("preferences.json").exists());
    }

    #[test]
    fn resetting_puts_every_value_back_and_leaves_the_notes_alone() {
        let s = Scratch::new("reset");
        let stored = preferences::Preferences {
            font_size: 24,
            display_name: "Mark".into(),
            avatar: "tova".into(),
            ..Default::default()
        };
        preferences::write_value(&s.data, &serde_json::to_value(&stored).unwrap());

        reset_preferences(&s.data).unwrap();

        let after = preferences::read(&s.data);
        assert_eq!(
            after.font_size,
            preferences::Preferences::default().font_size
        );
        assert_eq!(after.display_name, "");
        assert_eq!(after.avatar, "initials");
    }
}
