/*!
Every read and write of a file inside the vault goes through here — a port of
`src/main/vaultFile.ts`.

One pair of functions rather than a rule everyone has to remember: a note saved
down some path that skipped the encryption would sit in plain sight inside a
vault the reader believes is closed, and nothing would say so.
*/

use std::path::{Path, PathBuf};

use crate::crypto::{looks_encrypted, seal, unseal};
use crate::vault::vault_root;
use crate::vault_keys::{create_vault_key, is_vault_encrypted, key_for, remove_vault_key};

/// Files that are the vault's own bookkeeping, and are never encrypted.
const PLAIN: [&str; 2] = [".tova-vault", ".DS_Store"];

fn locked() -> String {
    "This vault is encrypted and has not been unlocked".into()
}

#[allow(dead_code)]
pub fn read_vault_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let raw = std::fs::read(path).map_err(|e| e.to_string())?;
    if !looks_encrypted(&raw) {
        return Ok(raw);
    }

    let key = key_for(&vault_root()).ok_or_else(locked)?;
    let envelope =
        String::from_utf8(raw).map_err(|_| "That file could not be opened".to_string())?;
    unseal(&envelope, &key)
}

#[allow(dead_code)]
pub fn read_vault_text(path: &Path) -> Result<String, String> {
    String::from_utf8(read_vault_bytes(path)?).map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub fn write_vault_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let root = vault_root();
    if !is_vault_encrypted(&root) {
        return std::fs::write(path, bytes).map_err(|e| e.to_string());
    }

    let key = key_for(&root).ok_or_else(locked)?;
    std::fs::write(path, seal(bytes, &key)?).map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub fn write_vault_text(path: &Path, text: &str) -> Result<(), String> {
    write_vault_bytes(path, text.as_bytes())
}

/// Every file under the vault, bookkeeping aside.
fn vault_files(directory: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut found = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name();
        if PLAIN.contains(&name.to_string_lossy().as_ref()) {
            continue;
        }
        let path = entry.path();
        match entry.file_type() {
            Ok(kind) if kind.is_dir() => found.extend(vault_files(&path)),
            Ok(kind) if kind.is_file() => found.push(path),
            _ => {}
        }
    }

    found
}

/// Turns a plain vault into an encrypted one, and hands back the recovery key.
///
/// Run over a vault that is already sealed it finishes the job instead, sealing
/// whatever is still plain with the key that is already there. A conversion
/// stopped halfway — a crash, a laptop lid — otherwise leaves a vault that says
/// it is encrypted and holds notes that are not, with no way left to say so.
/// Nothing comes back in that case: the recovery key was handed over the first
/// time and is not ours to hand over twice.
pub fn encrypt_vault(data_dir: &Path, root: &Path) -> Result<Option<String>, String> {
    let existing = is_vault_encrypted(root);
    let opened = match (existing, key_for(root)) {
        (true, None) => return Err(locked()),
        (true, Some(key)) => (key, None),
        (false, _) => {
            let (key, recovery) = create_vault_key(data_dir, root)?;
            (key, Some(recovery))
        }
    };

    for path in vault_files(root) {
        let raw = std::fs::read(&path).map_err(|e| e.to_string())?;
        if looks_encrypted(&raw) {
            continue;
        }
        std::fs::write(&path, seal(&raw, &opened.0)?).map_err(|e| e.to_string())?;
    }

    Ok(opened.1)
}

/// Turns it back, which needs the key it is being asked to stop using.
pub fn decrypt_vault(data_dir: &Path, root: &Path) -> Result<(), String> {
    if !is_vault_encrypted(root) {
        return Err("That vault is not encrypted".into());
    }
    let key = key_for(root).ok_or_else(locked)?;

    for path in vault_files(root) {
        let raw = std::fs::read(&path).map_err(|e| e.to_string())?;
        if !looks_encrypted(&raw) {
            continue;
        }
        let envelope =
            String::from_utf8(raw).map_err(|_| "That file could not be opened".to_string())?;
        std::fs::write(&path, unseal(&envelope, &key)?).map_err(|e| e.to_string())?;
    }

    // Last, so an interrupted run leaves a vault that still knows its own key.
    remove_vault_key(data_dir, root);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{one_at_a_time, set_active_vault};
    use crate::vault_keys::{lock_vault, unlock_with_recovery_key};

    const NOTE: &str = "---\ntitle: Slow Morning\n---\n\nCoffee. Empty streets.\n";

    /*
     * `read_vault_bytes` and `write_vault_bytes` read the vault in use, which
     * is global, so these hold the same lock the vaults tests do and put it
     * back on the way out.
     */
    struct Scratch {
        data: PathBuf,
        vault: PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            let base = std::env::temp_dir().join(format!("tova-vaultfile-{name}"));
            let _ = std::fs::remove_dir_all(&base);
            let (data, vault) = (base.join("data"), base.join("vault"));
            std::fs::create_dir_all(&data).unwrap();
            std::fs::create_dir_all(vault.join("notes")).unwrap();
            set_active_vault(Some(vault.clone()));
            Self {
                data,
                vault,
                _held: held,
            }
        }

        fn note(&self, name: &str) -> PathBuf {
            let path = self.vault.join("notes").join(name);
            std::fs::write(&path, NOTE).unwrap();
            path
        }

        fn seal(&self) -> String {
            encrypt_vault(&self.data, &self.vault).unwrap().unwrap()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            lock_vault(&self.vault);
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(self.data.parent().unwrap());
        }
    }

    #[test]
    fn a_vault_nobody_sealed_reads_and_writes_its_files_as_themselves() {
        let s = Scratch::new("plain");
        let path = s.note("slow-morning.md");

        assert_eq!(read_vault_text(&path).unwrap(), NOTE);

        write_vault_text(&path, "Changed.").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "Changed.");
    }

    #[test]
    fn sealing_leaves_nothing_readable_on_disk() {
        let s = Scratch::new("sealed");
        let path = s.note("slow-morning.md");

        s.seal();

        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("Empty streets"));
        assert!(!raw.contains("Slow Morning"));
        assert!(looks_encrypted(raw.as_bytes()));
        // And reads back as itself, through the one door.
        assert_eq!(read_vault_text(&path).unwrap(), NOTE);
    }

    #[test]
    fn sealing_reaches_every_folder_under_the_vault() {
        let s = Scratch::new("nested");
        let deep = s.vault.join("notes").join("work").join("q3");
        std::fs::create_dir_all(&deep).unwrap();
        let buried = deep.join("numbers.md");
        std::fs::write(&buried, "Revenue, and the shape of it.").unwrap();

        s.seal();

        assert!(looks_encrypted(&std::fs::read(&buried).unwrap()));
    }

    #[test]
    fn the_vaults_own_bookkeeping_stays_plain() {
        // The marker has to be readable by a machine that cannot open the
        // vault, or nothing could ever tell it was sealed.
        let s = Scratch::new("marker");
        s.note("slow-morning.md");

        s.seal();

        let marker = std::fs::read_to_string(s.vault.join(".tova-vault")).unwrap();
        assert!(!looks_encrypted(marker.as_bytes()));
        assert!(marker.contains("recovery"));
    }

    #[test]
    fn writing_into_a_sealed_vault_seals_what_is_written() {
        let s = Scratch::new("write");
        let path = s.note("slow-morning.md");
        s.seal();

        write_vault_text(&path, "Half-formed ideas.").unwrap();

        assert!(!std::fs::read_to_string(&path)
            .unwrap()
            .contains("Half-formed"));
        assert_eq!(read_vault_text(&path).unwrap(), "Half-formed ideas.");
    }

    #[test]
    fn a_locked_vault_gives_up_nothing() {
        let s = Scratch::new("locked");
        let path = s.note("slow-morning.md");
        s.seal();

        lock_vault(&s.vault);

        assert_eq!(read_vault_text(&path), Err(locked()));
        assert_eq!(write_vault_text(&path, "Anything."), Err(locked()));
        // And the file on disk is untouched by the attempt.
        assert!(looks_encrypted(&std::fs::read(&path).unwrap()));
    }

    #[test]
    fn a_conversion_that_stopped_halfway_can_be_finished() {
        /*
         * A crash or a closed lid mid-seal leaves a vault that says it is
         * encrypted and holds notes that are not. Running it again seals the
         * rest with the key that is already there, and hands back nothing —
         * the recovery key was given out the first time and is not ours to
         * give twice.
         */
        let s = Scratch::new("halfway");
        s.note("first.md");
        s.seal();
        let late = s.note("arrived-late.md");

        assert_eq!(encrypt_vault(&s.data, &s.vault).unwrap(), None);
        assert!(looks_encrypted(&std::fs::read(&late).unwrap()));
    }

    #[test]
    fn a_second_pass_does_not_seal_what_is_already_sealed() {
        // Sealing twice would leave a file no key opens in one go.
        let s = Scratch::new("twice");
        let path = s.note("slow-morning.md");
        s.seal();
        let after_first = std::fs::read_to_string(&path).unwrap();

        encrypt_vault(&s.data, &s.vault).unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), after_first);
        assert_eq!(read_vault_text(&path).unwrap(), NOTE);
    }

    #[test]
    fn sealing_a_locked_vault_is_refused_rather_than_attempted() {
        let s = Scratch::new("sealedlocked");
        s.note("slow-morning.md");
        s.seal();
        lock_vault(&s.vault);

        assert_eq!(encrypt_vault(&s.data, &s.vault), Err(locked()));
    }

    #[test]
    fn unsealing_puts_the_notes_back_and_takes_the_key_away() {
        let s = Scratch::new("unseal");
        let path = s.note("slow-morning.md");
        s.seal();

        decrypt_vault(&s.data, &s.vault).unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), NOTE);
        assert!(!s.vault.join(".tova-vault").exists());
    }

    #[test]
    fn unsealing_needs_the_key_it_is_being_asked_to_stop_using() {
        let s = Scratch::new("unseallocked");
        let path = s.note("slow-morning.md");
        s.seal();
        lock_vault(&s.vault);

        assert_eq!(decrypt_vault(&s.data, &s.vault), Err(locked()));
        // Nothing half-done: the marker and the sealed file both survive.
        assert!(s.vault.join(".tova-vault").exists());
        assert!(looks_encrypted(&std::fs::read(&path).unwrap()));
    }

    #[test]
    fn unsealing_a_vault_that_was_never_sealed_says_so() {
        let s = Scratch::new("neversealed");

        assert_eq!(
            decrypt_vault(&s.data, &s.vault),
            Err("That vault is not encrypted".into())
        );
    }

    #[test]
    fn the_whole_round_trip_through_what_was_written_down() {
        // The path a reader takes on a second machine: a sealed folder, a
        // recovery key off paper, and the notes as they were.
        let s = Scratch::new("roundtrip");
        let path = s.note("slow-morning.md");
        let recovery = s.seal();
        lock_vault(&s.vault);

        assert!(unlock_with_recovery_key(&s.data, &s.vault, &recovery));
        assert_eq!(read_vault_text(&path).unwrap(), NOTE);
    }

    #[test]
    fn images_go_through_the_same_envelope_as_words() {
        let s = Scratch::new("bytes");
        let png = [0x89u8, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff];
        let path = s.vault.join("notes").join("plot.png");
        std::fs::write(&path, png).unwrap();

        s.seal();

        assert_eq!(read_vault_bytes(&path).unwrap(), png);
    }
}
