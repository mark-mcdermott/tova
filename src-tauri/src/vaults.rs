/*!
The vaults a reader holds, and switching between them — a port of
`src/main/vaults.ts`.
*/

use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::preferences;
use crate::vault::{default_vault_root, ensure_vault, set_active_vault};
use crate::vault_file::{decrypt_vault as unseal_vault, encrypt_vault as seal_vault};
use crate::vault_keys::{is_vault_encrypted, unlock_vault as open_vault, unlock_with_recovery_key};

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
            let encrypted = is_vault_encrypted(&path);
            VaultChoice {
                name: name_of(&path),
                active: path == active,
                encrypted,
                // Asked rather than assumed: unlocking is what says whether
                // this machine's keychain still holds the key.
                locked: encrypted && !open_vault(data_dir, &path),
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
    // Before anything reads from it, so a sealed vault opens rather than
    // looking like a folder full of gibberish.
    open_vault(data_dir, path);

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

/// Seals the vault, handing back the one way in that is not this machine.
pub fn encrypt_vault(data_dir: &Path, path: &Path) -> Result<String, String> {
    assert_known(data_dir, path)?;
    if is_vault_encrypted(path) {
        return Err("That vault is already encrypted".into());
    }

    seal_vault(data_dir, path)?.ok_or_else(|| "That vault is already encrypted".into())
}

pub fn decrypt_vault(data_dir: &Path, path: &Path) -> Result<Vec<VaultChoice>, String> {
    assert_known(data_dir, path)?;
    unseal_vault(data_dir, path)?;
    Ok(list(data_dir))
}

pub fn unlock_vault(data_dir: &Path, path: &Path, recovery_key: &str) -> Result<bool, String> {
    assert_known(data_dir, path)?;
    Ok(unlock_with_recovery_key(data_dir, path, recovery_key))
}

/// The renderer names a path; only one of the reader's own is ever acted on.
fn assert_known(data_dir: &Path, path: &Path) -> Result<(), String> {
    if known(data_dir).contains(&path.to_path_buf()) {
        return Ok(());
    }
    Err("That is not one of your vaults".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    use crate::vault::one_at_a_time;
    use crate::vault_keys::lock_vault;

    /*
     * These write preferences and switch the vault in use, which is global
     * state, so they run one at a time rather than racing each other for it.
     */
    struct Scratch {
        data: PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
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
    fn a_sealed_vault_says_so_and_says_whether_this_machine_can_open_it() {
        let s = Scratch::new("sealed");
        let other = s.elsewhere("sealed-vault");
        add_vault(&s.data, &other).unwrap();

        encrypt_vault(&s.data, &other).unwrap();

        let listed = |s: &Scratch| {
            list(&s.data)
                .into_iter()
                .find(|v| v.path == other.to_string_lossy())
                .unwrap()
        };
        let sealed = listed(&s);
        assert!(sealed.encrypted);
        // Sealing left it open, so it is not locked.
        assert!(!sealed.locked);

        lock_vault(&other);

        // And with no key held and none remembered, it is.
        assert!(listed(&s).locked);
    }

    #[test]
    fn a_stray_marker_does_not_lock_a_reader_out_of_plain_notes() {
        // The file has to say how the vault is opened, not merely exist. A
        // leftover or half-written one should read as "not sealed".
        let s = Scratch::new("stray");
        let other = s.elsewhere("stray-marker");
        std::fs::write(
            other.join(".tova-vault"),
            json!({ "version": 1 }).to_string(),
        )
        .unwrap();
        add_vault(&s.data, &other).unwrap();

        let listed = list(&s.data)
            .into_iter()
            .find(|v| v.path == other.to_string_lossy())
            .unwrap();

        assert!(!listed.encrypted);
        assert!(!listed.locked);
    }

    #[test]
    fn sealing_the_same_vault_twice_is_refused() {
        // vault_file will happily finish an interrupted conversion; this layer
        // will not, because a second recovery key for the same vault is a
        // thing a reader would reasonably believe replaced the first.
        let s = Scratch::new("twice-sealed");
        let other = s.elsewhere("vault");
        add_vault(&s.data, &other).unwrap();
        encrypt_vault(&s.data, &other).unwrap();

        assert_eq!(
            encrypt_vault(&s.data, &other),
            Err("That vault is already encrypted".into())
        );
    }

    #[test]
    fn unsealing_lists_it_as_plain_again() {
        let s = Scratch::new("unsealed");
        let other = s.elsewhere("vault");
        add_vault(&s.data, &other).unwrap();
        encrypt_vault(&s.data, &other).unwrap();

        let listed = decrypt_vault(&s.data, &other).unwrap();

        let one = listed
            .iter()
            .find(|v| v.path == other.to_string_lossy())
            .unwrap();
        assert!(!one.encrypted);
        assert!(!one.locked);
    }

    #[test]
    fn what_was_written_down_opens_it_and_anything_else_does_not() {
        let s = Scratch::new("recovery");
        let other = s.elsewhere("vault");
        add_vault(&s.data, &other).unwrap();
        let recovery = encrypt_vault(&s.data, &other).unwrap();
        lock_vault(&other);

        assert_eq!(
            unlock_vault(&s.data, &other, "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ"),
            Ok(false)
        );
        assert_eq!(unlock_vault(&s.data, &other, &recovery), Ok(true));
    }

    #[test]
    fn none_of_it_touches_a_folder_it_was_never_told_about() {
        // The renderer names a path, and only one of the reader's own is ever
        // acted on — sealing a stranger's folder would be an odd way to lose
        // somebody else's files.
        let s = Scratch::new("stranger");
        let stranger = s.elsewhere("stranger");

        assert!(encrypt_vault(&s.data, &stranger).is_err());
        assert!(decrypt_vault(&s.data, &stranger).is_err());
        assert!(unlock_vault(&s.data, &stranger, "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ").is_err());
        assert!(!stranger.join(".tova-vault").exists());
    }
}
