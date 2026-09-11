/*!
The vaults a reader holds, and switching between them — a port of
`src/main/vaults.ts`.

Encryption is not here yet. `encrypted` is answered honestly, by looking for the
marker file a sealed vault carries; `locked` is answered honestly too, and says
true for every sealed vault, because this backend cannot open one until the
keychain and the cipher are ported. The renderer will offer Unlock and the
unlock will say it is not ported, which is the truth and is better than a vault
that claims to be open and then reads as gibberish.
*/

use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::preferences;
use crate::vault::{default_vault_root, ensure_vault, set_active_vault};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VaultChoice {
    pub path: String,
    pub name: String,
    pub active: bool,
    /// Whether this vault's files are sealed.
    pub encrypted: bool,
    /// Encrypted, and this machine cannot open it without the recovery key.
    pub locked: bool,
}

/// The file a sealed vault carries, kept in the vault so the folder travels
/// knowing what it is.
const MARKER: &str = ".tova-vault";

fn is_encrypted(path: &Path) -> bool {
    path.join(MARKER).is_file()
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Every vault the reader has, the default one always among them. The default
/// is not stored — it is where a vault lives when nobody has said otherwise,
/// and writing it down would only let it go stale if the home directory moved.
pub fn list(data_dir: &Path) -> Vec<VaultChoice> {
    let stored = preferences::read(data_dir);
    let fallback = default_vault_root();

    let mut paths = vec![fallback.clone()];
    for path in &stored.vaults {
        if Path::new(path) != fallback {
            paths.push(PathBuf::from(path));
        }
    }

    let active = stored
        .active_vault
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or(fallback);

    paths
        .into_iter()
        .map(|path| {
            let encrypted = is_encrypted(&path);
            VaultChoice {
                name: name_of(&path),
                active: path == active,
                encrypted,
                // Not yet ported: there is no key to hold, so a sealed vault
                // is one this backend cannot open.
                locked: encrypted,
                path: path.to_string_lossy().into_owned(),
            }
        })
        .collect()
}

fn known(data_dir: &Path) -> Vec<PathBuf> {
    let stored = preferences::read(data_dir);
    let mut all = vec![default_vault_root()];
    all.extend(stored.vaults.iter().map(PathBuf::from));
    all
}

/// Switches, creating the section directories the new vault may not have yet.
pub fn use_vault(data_dir: &Path, path: &Path) -> Result<Vec<VaultChoice>, String> {
    if !known(data_dir).contains(&path.to_path_buf()) {
        return Err("That is not one of your vaults".into());
    }

    let fallback = default_vault_root();
    let chosen = if path == fallback {
        None
    } else {
        Some(path.to_path_buf())
    };

    set_active_vault(chosen.clone());

    let mut stored = preferences::read(data_dir);
    stored.active_vault = chosen.map(|p| p.to_string_lossy().into_owned());
    let sections: Vec<String> = stored.sections.iter().map(|s| s.id.clone()).collect();
    let value = serde_json::to_value(&stored).map_err(|e| e.to_string())?;
    preferences::write_value(data_dir, &value);

    let _ = ensure_vault(path, &sections);
    Ok(list(data_dir))
}

/// Adds a directory as a vault. The picker is the caller's: this takes the
/// answer, so the decision about what a folder is stays testable.
pub fn add_vault(data_dir: &Path, chosen: &Path) -> Result<Vec<VaultChoice>, String> {
    std::fs::create_dir_all(chosen).map_err(|e| e.to_string())?;

    let mut stored = preferences::read(data_dir);
    let path = chosen.to_string_lossy().into_owned();
    if !stored.vaults.contains(&path) && chosen != default_vault_root() {
        stored.vaults.push(path);
        let value = serde_json::to_value(&stored).map_err(|e| e.to_string())?;
        preferences::write_value(data_dir, &value);
    }

    use_vault(data_dir, chosen)
}

/// Forgets a vault. The directory and everything in it stays exactly where it
/// is — Tova stops listing it, and nothing else. Removing the one in use falls
/// back to the default rather than leaving nothing open.
pub fn forget_vault(data_dir: &Path, path: &Path) -> Result<Vec<VaultChoice>, String> {
    if path == default_vault_root() {
        return Err("The default vault cannot be removed".into());
    }

    let mut stored = preferences::read(data_dir);
    let target = path.to_string_lossy().into_owned();
    let was_active = stored.active_vault.as_deref() == Some(target.as_str());

    stored.vaults.retain(|vault| vault != &target);
    if was_active {
        stored.active_vault = None;
    }
    let sections: Vec<String> = stored.sections.iter().map(|s| s.id.clone()).collect();
    let value = serde_json::to_value(&stored).map_err(|e| e.to_string())?;
    preferences::write_value(data_dir, &value);

    if was_active {
        set_active_vault(None);
        let _ = ensure_vault(&default_vault_root(), &sections);
    }

    Ok(list(data_dir))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /*
     * These write preferences and switch the vault in use, which is global
     * state, so they run one at a time under a lock of their own rather than
     * racing each other for it.
     */
    static ORDER: std::sync::Mutex<()> = std::sync::Mutex::new(());

    struct Scratch {
        data: PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = ORDER.lock().unwrap_or_else(|e| e.into_inner());
            let data = std::env::temp_dir().join(format!("tova-vaults-{name}"));
            let _ = std::fs::remove_dir_all(&data);
            std::fs::create_dir_all(&data).unwrap();
            set_active_vault(None);
            Self { data, _held: held }
        }

        fn elsewhere(&self, name: &str) -> PathBuf {
            let path = self.data.join(name);
            std::fs::create_dir_all(&path).unwrap();
            path
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(&self.data);
        }
    }

    #[test]
    fn the_default_is_always_listed_and_is_never_stored() {
        let s = Scratch::new("default");
        let listed = list(&s.data);

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].path, default_vault_root().to_string_lossy());
        assert!(listed[0].active);
        // It is where a vault lives when nobody has said otherwise; writing it
        // down would only let it go stale if the home directory moved.
        assert!(preferences::read(&s.data).vaults.is_empty());
    }

    #[test]
    fn adding_one_lists_it_and_switches_to_it() {
        let s = Scratch::new("add");
        let other = s.elsewhere("another");

        let listed = add_vault(&s.data, &other).unwrap();

        assert_eq!(listed.len(), 2);
        let added = listed.iter().find(|v| v.path == other.to_string_lossy());
        assert!(added.is_some_and(|v| v.active));
        assert!(!listed[0].active);
    }

    #[test]
    fn adding_the_same_one_twice_lists_it_once() {
        let s = Scratch::new("twice");
        let other = s.elsewhere("another");

        add_vault(&s.data, &other).unwrap();
        let listed = add_vault(&s.data, &other).unwrap();

        assert_eq!(listed.len(), 2);
    }

    #[test]
    fn refuses_to_switch_to_one_it_was_never_told_about() {
        // The renderer names a path; only one of the reader's own is acted on.
        let s = Scratch::new("unknown");
        let stranger = s.elsewhere("stranger");

        assert!(use_vault(&s.data, &stranger).is_err());
    }

    #[test]
    fn switching_makes_the_sections_the_new_one_may_not_have() {
        let s = Scratch::new("sections");
        let other = s.elsewhere("another");

        add_vault(&s.data, &other).unwrap();

        assert!(other.join("notes").is_dir());
        assert!(other.join("daily").is_dir());
        assert!(other.join("posts").is_dir());
    }

    #[test]
    fn forgetting_leaves_the_folder_and_everything_in_it() {
        let s = Scratch::new("forget");
        let other = s.elsewhere("another");
        add_vault(&s.data, &other).unwrap();
        std::fs::write(other.join("notes").join("kept.md"), "still here").unwrap();

        let listed = forget_vault(&s.data, &other).unwrap();

        assert_eq!(listed.len(), 1);
        assert!(other.join("notes").join("kept.md").is_file());
    }

    #[test]
    fn forgetting_the_one_in_use_falls_back_to_the_default() {
        let s = Scratch::new("fallback");
        let other = s.elsewhere("another");
        add_vault(&s.data, &other).unwrap();

        let listed = forget_vault(&s.data, &other).unwrap();

        assert!(listed[0].active);
        assert_eq!(preferences::read(&s.data).active_vault, None);
    }

    #[test]
    fn the_default_cannot_be_forgotten() {
        let s = Scratch::new("undeletable");

        assert!(forget_vault(&s.data, &default_vault_root()).is_err());
    }

    #[test]
    fn a_sealed_vault_says_so_and_says_this_backend_cannot_open_it() {
        let s = Scratch::new("sealed");
        let other = s.elsewhere("sealed-vault");
        std::fs::write(
            other.join(".tova-vault"),
            json!({ "version": 1 }).to_string(),
        )
        .unwrap();
        add_vault(&s.data, &other).unwrap();

        let sealed = list(&s.data)
            .into_iter()
            .find(|v| v.path == other.to_string_lossy())
            .unwrap();

        assert!(sealed.encrypted);
        // Honest rather than optimistic: there is no key to hold until the
        // keychain is ported, so it is locked.
        assert!(sealed.locked);
    }
}
