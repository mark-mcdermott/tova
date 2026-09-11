/*!
Which vaults are sealed, and which of them this machine can open — a port of
`src/main/vaultKeys.ts`.

Two places hold a key, and they are different in kind. The marker file in the
vault holds the key wrapped by what the reader wrote down, and travels with the
folder. The key store beside the app holds it wrapped by the OS keychain, and
does not: a stolen vault carries no key that file could give up.
*/

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use crate::crypto::{
    new_key, new_recovery_key, new_salt, recovery_key_to_cipher_key, seal, unseal, KEY_BYTES,
};
use crate::safe_storage;

/// The file that says a vault is encrypted, kept in the vault itself.
///
/// In the vault rather than in preferences, because the vault is the thing that
/// travels: a folder synced to another machine arrives knowing what it is, and
/// carrying the one copy of its key that a recovery key can open.
const MARKER: &str = ".tova-vault";

#[derive(Serialize, Deserialize)]
struct Recovery {
    salt: String,
    envelope: String,
}

#[derive(Serialize, Deserialize)]
struct VaultMarker {
    version: u32,
    /// The vault key, wrapped by what was written down.
    recovery: Recovery,
}

fn marker_path(root: &Path) -> PathBuf {
    root.join(MARKER)
}

/// Keys this machine can open without being asked, wrapped by the keychain.
fn key_store_path(data_dir: &Path) -> PathBuf {
    data_dir.join("vault-keys.json")
}

fn marker_json(root: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(marker_path(root)).ok()?;
    let parsed: Value = serde_json::from_str(&text).ok()?;
    // Asked for `recovery` rather than for a whole marker this version knows
    // how to read, which is what the TypeScript asks. The two have to agree,
    // and this is the side to agree on: a marker written by some later version
    // means sealed-and-not-openable-here, and reading it as "not sealed" would
    // put the next plain note inside a vault the reader believes is closed.
    parsed.get("recovery").is_some().then_some(parsed)
}

fn read_marker(root: &Path) -> Option<VaultMarker> {
    serde_json::from_value(marker_json(root)?).ok()
}

pub fn is_vault_encrypted(root: &Path) -> bool {
    marker_json(root).is_some()
}

fn read_key_store(data_dir: &Path) -> HashMap<String, String> {
    std::fs::read_to_string(key_store_path(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_key_store(data_dir: &Path, store: &HashMap<String, String>) {
    if let Ok(text) = serde_json::to_string_pretty(store) {
        let _ = std::fs::write(key_store_path(data_dir), text);
    }
}

/// Remembers a key so this machine need not ask again. Wrapped by the OS
/// keychain, which is what makes it safe to keep beside the app rather than in
/// the vault — a stolen folder carries no key this file could give up.
fn remember_key(data_dir: &Path, root: &Path, key: &[u8]) {
    if !safe_storage::is_available() {
        return;
    }

    let Some(wrapped) = safe_storage::encrypt_string(&B64.encode(key)) else {
        return;
    };
    let mut store = read_key_store(data_dir);
    store.insert(root.to_string_lossy().into_owned(), B64.encode(wrapped));
    write_key_store(data_dir, &store);
}

fn forget_key(data_dir: &Path, root: &Path) {
    let mut store = read_key_store(data_dir);
    store.remove(root.to_string_lossy().as_ref());
    write_key_store(data_dir, &store);
}

fn remembered_key(data_dir: &Path, root: &Path) -> Option<Vec<u8>> {
    let stored = read_key_store(data_dir).remove(root.to_string_lossy().as_ref())?;
    if !safe_storage::is_available() {
        return None;
    }

    // A keychain that changed underneath us reads as nothing here rather than
    // as an error. The recovery key is the way back.
    let key = B64
        .decode(safe_storage::decrypt_string(&B64.decode(stored).ok()?)?)
        .ok()?;
    (key.len() == KEY_BYTES).then_some(key)
}

/*
 * Keys held for this run, by vault. In memory only: quitting locks every vault
 * that this machine could not open on its own anyway.
 */
static UNLOCKED: LazyLock<Mutex<HashMap<PathBuf, Vec<u8>>>> = LazyLock::new(Default::default);

fn held() -> std::sync::MutexGuard<'static, HashMap<PathBuf, Vec<u8>>> {
    UNLOCKED.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn key_for(root: &Path) -> Option<Vec<u8>> {
    held().get(root).cloned()
}

#[allow(dead_code)]
pub fn lock_vault(root: &Path) {
    held().remove(root);
}

/// Opens a vault with the key this machine remembers, if it remembers one.
pub fn unlock_vault(data_dir: &Path, root: &Path) -> bool {
    if held().contains_key(root) {
        return true;
    }
    if !is_vault_encrypted(root) {
        return true;
    }

    match remembered_key(data_dir, root) {
        Some(key) => {
            held().insert(root.to_path_buf(), key);
            true
        }
        None => false,
    }
}

/// Opens a vault with what was written down, and remembers it afterwards so it
/// is asked for once per machine rather than once per launch.
pub fn unlock_with_recovery_key(data_dir: &Path, root: &Path, recovery_key: &str) -> bool {
    let Some(marker) = read_marker(root) else {
        return false;
    };

    // The wrong key, or a marker that has been edited. Either way, no.
    let opened = B64
        .decode(marker.recovery.salt)
        .ok()
        .and_then(|salt| recovery_key_to_cipher_key(recovery_key, &salt).ok())
        .and_then(|wrapping| unseal(&marker.recovery.envelope, &wrapping).ok())
        .filter(|key| key.len() == KEY_BYTES);

    let Some(key) = opened else { return false };

    held().insert(root.to_path_buf(), key.clone());
    remember_key(data_dir, root, &key);
    true
}

/// Gives a vault a key and writes down the one way back to it. The recovery key
/// is returned once and never stored in the clear — losing it and the keychain
/// together means losing the notes, which is the bargain encryption makes.
pub fn create_vault_key(data_dir: &Path, root: &Path) -> Result<(Vec<u8>, String), String> {
    let key = new_key();
    let recovery_key = new_recovery_key();
    let salt = new_salt();
    let wrapping = recovery_key_to_cipher_key(&recovery_key, &salt)?;

    let marker = VaultMarker {
        version: 1,
        recovery: Recovery {
            salt: B64.encode(&salt),
            envelope: seal(&key, &wrapping)?,
        },
    };
    let text = serde_json::to_string_pretty(&marker).map_err(|e| e.to_string())?;
    std::fs::write(marker_path(root), text).map_err(|e| e.to_string())?;

    remember_key(data_dir, root, &key);
    held().insert(root.to_path_buf(), key.clone());

    Ok((key, recovery_key))
}

/// Takes the key away once the files no longer need it.
pub fn remove_vault_key(data_dir: &Path, root: &Path) {
    let _ = std::fs::remove_file(marker_path(root));
    forget_key(data_dir, root);
    held().remove(root);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// A password of the shape Chromium keeps in the login keychain. The real
    /// one is never read here — see safe_storage.rs on why tests use their own.
    const KEYCHAIN: &[u8] = b"c2hvcnQtbGl2ZWQtdGVzdA==";

    /*
     * The keychain stand-in is global, so these hold the same lock the vaults
     * and vault_file tests hold, and put it back to nothing on the way out.
     */
    struct Scratch {
        data: PathBuf,
        vault: PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = crate::vault::one_at_a_time();
            safe_storage::stand_in(None);
            let base = std::env::temp_dir().join(format!("tova-keys-{name}"));
            let _ = std::fs::remove_dir_all(&base);
            let (data, vault) = (base.join("data"), base.join("vault"));
            std::fs::create_dir_all(&data).unwrap();
            std::fs::create_dir_all(&vault).unwrap();
            Self {
                data,
                vault,
                _held: held,
            }
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            held().remove(&self.vault);
            safe_storage::stand_in(None);
            let _ = std::fs::remove_dir_all(self.data.parent().unwrap());
        }
    }

    #[test]
    fn a_folder_nobody_sealed_is_not_encrypted_and_needs_no_opening() {
        let s = Scratch::new("plain");

        assert!(!is_vault_encrypted(&s.vault));
        assert!(unlock_vault(&s.data, &s.vault));
        assert_eq!(key_for(&s.vault), None);
    }

    #[test]
    fn sealing_writes_a_marker_and_leaves_the_vault_open() {
        let s = Scratch::new("seal");

        let (key, recovery) = create_vault_key(&s.data, &s.vault).unwrap();

        assert!(is_vault_encrypted(&s.vault));
        assert_eq!(key_for(&s.vault), Some(key));
        assert_eq!(recovery.len(), 29);
        // The marker holds the key wrapped, never the key.
        let marker = std::fs::read_to_string(s.vault.join(MARKER)).unwrap();
        assert!(!marker.contains(&recovery));
    }

    #[test]
    fn what_was_written_down_opens_it_again() {
        let s = Scratch::new("recover");
        let (key, recovery) = create_vault_key(&s.data, &s.vault).unwrap();
        lock_vault(&s.vault);

        assert!(unlock_with_recovery_key(&s.data, &s.vault, &recovery));
        assert_eq!(key_for(&s.vault), Some(key));
    }

    #[test]
    fn it_does_not_mind_how_the_key_was_typed_back() {
        let s = Scratch::new("typed");
        let (_key, recovery) = create_vault_key(&s.data, &s.vault).unwrap();
        lock_vault(&s.vault);

        // Read off paper by someone who used spaces, or none, or shouted.
        let typed = recovery.to_lowercase().replace('-', " ");
        assert!(unlock_with_recovery_key(&s.data, &s.vault, &typed));
    }

    #[test]
    fn the_wrong_key_opens_nothing() {
        let s = Scratch::new("wrong");
        create_vault_key(&s.data, &s.vault).unwrap();
        lock_vault(&s.vault);

        assert!(!unlock_with_recovery_key(
            &s.data,
            &s.vault,
            &new_recovery_key()
        ));
        assert_eq!(key_for(&s.vault), None);
    }

    #[test]
    fn a_marker_that_has_been_edited_opens_nothing() {
        let s = Scratch::new("edited");
        let (_key, recovery) = create_vault_key(&s.data, &s.vault).unwrap();
        lock_vault(&s.vault);

        // A new salt against the same envelope: the file still parses, and
        // the key it yields is not the one that sealed anything.
        let text = std::fs::read_to_string(s.vault.join(MARKER)).unwrap();
        let mut marker: Value = serde_json::from_str(&text).unwrap();
        marker["recovery"]["salt"] = json!(B64.encode(new_salt()));
        std::fs::write(s.vault.join(MARKER), marker.to_string()).unwrap();

        assert!(!unlock_with_recovery_key(&s.data, &s.vault, &recovery));
    }

    #[test]
    fn a_marker_without_a_recovery_envelope_is_not_a_sealed_vault() {
        // Faithful to the TypeScript, which reads the marker and asks for
        // `recovery` rather than trusting the file's presence. A stray file
        // by that name should not lock a reader out of plain notes.
        let s = Scratch::new("markerless");
        std::fs::write(s.vault.join(MARKER), json!({ "version": 1 }).to_string()).unwrap();

        assert!(!is_vault_encrypted(&s.vault));
    }

    #[test]
    fn a_marker_this_version_cannot_read_seals_the_vault_rather_than_opening_it() {
        // The dangerous direction is the other one: reading an unfamiliar
        // marker as "not sealed" would write the next note in plain sight
        // inside a vault the reader believes is closed.
        let s = Scratch::new("future");
        std::fs::write(
            s.vault.join(MARKER),
            json!({ "version": 2, "recovery": { "scheme": "something-later" } }).to_string(),
        )
        .unwrap();

        assert!(is_vault_encrypted(&s.vault));
        assert!(!unlock_vault(&s.data, &s.vault));
        assert!(!unlock_with_recovery_key(
            &s.data,
            &s.vault,
            &new_recovery_key()
        ));
    }

    #[test]
    fn nonsense_in_the_marker_is_not_a_sealed_vault_either() {
        let s = Scratch::new("nonsense");
        std::fs::write(s.vault.join(MARKER), "not json at all").unwrap();

        assert!(!is_vault_encrypted(&s.vault));
    }

    #[test]
    fn taking_the_key_away_leaves_a_plain_folder() {
        let s = Scratch::new("remove");
        create_vault_key(&s.data, &s.vault).unwrap();

        remove_vault_key(&s.data, &s.vault);

        assert!(!is_vault_encrypted(&s.vault));
        assert_eq!(key_for(&s.vault), None);
        assert!(!s.vault.join(MARKER).exists());
    }

    #[test]
    fn without_a_keychain_a_key_is_held_for_the_run_and_no_longer() {
        /*
         * What Electron does on a machine with no secret service, and what
         * this backend did everywhere until the keychain was ported. Kept
         * because it is still the behaviour on Linux, and because it is the
         * difference the test below is measuring against.
         */
        let s = Scratch::new("forgets");
        safe_storage::stand_in(None);
        let (_key, recovery) = create_vault_key(&s.data, &s.vault).unwrap();
        assert!(unlock_vault(&s.data, &s.vault));

        lock_vault(&s.vault);

        assert!(!unlock_vault(&s.data, &s.vault));
        assert!(unlock_with_recovery_key(&s.data, &s.vault, &recovery));
    }

    #[test]
    fn with_a_keychain_the_reader_is_asked_once_rather_than_once_per_launch() {
        let s = Scratch::new("remembers");
        safe_storage::stand_in(Some(KEYCHAIN));
        let (key, _recovery) = create_vault_key(&s.data, &s.vault).unwrap();

        // Quitting is what `lock_vault` stands for here: the run's keys go,
        // and the store beside the app is all that is left.
        lock_vault(&s.vault);

        assert!(unlock_vault(&s.data, &s.vault));
        assert_eq!(key_for(&s.vault), Some(key));
    }

    #[test]
    fn a_keychain_that_changed_underneath_us_sends_the_reader_to_their_paper() {
        // A restored machine, a new login keychain. The store is still there
        // and no longer means anything, and saying so is the whole of it —
        // the recovery key is the way back.
        let s = Scratch::new("changed");
        safe_storage::stand_in(Some(KEYCHAIN));
        let (_key, recovery) = create_vault_key(&s.data, &s.vault).unwrap();
        lock_vault(&s.vault);

        safe_storage::stand_in(Some(b"a-keychain-this-machine-no-longer-has"));

        assert!(!unlock_vault(&s.data, &s.vault));
        assert!(unlock_with_recovery_key(&s.data, &s.vault, &recovery));
    }

    #[test]
    fn taking_the_key_away_takes_it_out_of_the_store_too() {
        let s = Scratch::new("forgotten");
        safe_storage::stand_in(Some(KEYCHAIN));
        create_vault_key(&s.data, &s.vault).unwrap();

        remove_vault_key(&s.data, &s.vault);

        assert!(read_key_store(&s.data).is_empty());
    }

    #[test]
    fn nothing_it_writes_beside_the_app_holds_a_key_in_the_clear() {
        let s = Scratch::new("store");
        safe_storage::stand_in(Some(KEYCHAIN));
        let (key, recovery) = create_vault_key(&s.data, &s.vault).unwrap();

        let store = std::fs::read_to_string(key_store_path(&s.data)).unwrap_or_default();
        assert!(!store.contains(&B64.encode(&key)));
        assert!(!store.contains(&recovery));
    }
}
