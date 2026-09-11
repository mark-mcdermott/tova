/*!
The envelope a sealed note lives in — a port of `src/main/crypto.ts`.

Byte-for-byte the same envelope the Electron side writes, because both
backends read the same vault while the port is in flight. A reader who opens
Tova under one and then the other must not be told their notes are corrupt, so
the format is pinned by `conformance/crypto.json` rather than by this file
agreeing with itself.
*/

use aes_gcm::aead::{Aead, KeyInit, Nonce};
use aes_gcm::{Aes256Gcm, Key};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;

const IV_BYTES: usize = 12;
const TAG_BYTES: usize = 16;
pub const KEY_BYTES: usize = 32;

/// The first line of every encrypted file. A vault's files stay files — text,
/// syncable, and recognisable for what they are rather than a blob that looks
/// like corruption.
const MAGIC: &str = "TOVA-ENCRYPTED-V1";

/*
 * Bytes, where the TypeScript takes the first 64 decoded as UTF-8. The two
 * agree: the magic is ASCII, so a file that starts with it survives a lossy
 * decode unchanged, and a file that does not cannot be made to start with it
 * by one.
 */
pub fn looks_encrypted(raw: &[u8]) -> bool {
    raw.starts_with(MAGIC.as_bytes())
}

fn random(bytes: &mut [u8]) {
    getrandom::fill(bytes).expect("the operating system has no randomness to give");
}

pub fn new_key() -> Vec<u8> {
    let mut key = vec![0u8; KEY_BYTES];
    random(&mut key);
    key
}

pub fn new_salt() -> Vec<u8> {
    let mut salt = vec![0u8; 16];
    random(&mut salt);
    salt
}

fn cipher(key: &[u8]) -> Result<Aes256Gcm, String> {
    let key = Key::<Aes256Gcm>::try_from(key).map_err(|_| "That is not a vault key".to_string())?;
    Ok(Aes256Gcm::new(&key))
}

fn nonce(iv: &[u8]) -> Result<Nonce<Aes256Gcm>, String> {
    Nonce::<Aes256Gcm>::try_from(iv).map_err(|_| "That is not a Tova encrypted file".to_string())
}

/// Magic, nonce and payload, a line each.
pub fn seal(plain: &[u8], key: &[u8]) -> Result<String, String> {
    let mut iv = [0u8; IV_BYTES];
    random(&mut iv);

    // RustCrypto returns ciphertext with the tag already appended, which is
    // the order Node's `cipher.final()` then `getAuthTag()` produces.
    let payload = cipher(key)?
        .encrypt(&nonce(&iv)?, plain)
        .map_err(|_| "That file could not be sealed".to_string())?;

    Ok(format!(
        "{MAGIC}\n{}\n{}\n",
        B64.encode(iv),
        B64.encode(payload)
    ))
}

pub fn unseal(envelope: &str, key: &[u8]) -> Result<Vec<u8>, String> {
    let mut lines = envelope.split('\n');
    let magic = lines.next().unwrap_or_default();
    let (Some(iv), Some(payload)) = (lines.next(), lines.next()) else {
        return Err("That is not a Tova encrypted file".into());
    };
    if magic != MAGIC {
        return Err("That is not a Tova encrypted file".into());
    }

    let iv = B64
        .decode(iv)
        .map_err(|_| "That is not a Tova encrypted file".to_string())?;
    let bytes = B64
        .decode(payload)
        .map_err(|_| "That is not a Tova encrypted file".to_string())?;
    if bytes.len() < TAG_BYTES {
        return Err("The file is too short to be intact".into());
    }

    cipher(key)?
        .decrypt(&nonce(&iv)?, bytes.as_slice())
        // Deliberately one message for a wrong key and for an altered file.
        // Which of the two it was is not something a caller can act on, and
        // saying would tell whoever altered it that the key was right.
        .map_err(|_| "That file could not be opened".to_string())
}

/*
 * No I, O, 0 or 1: a recovery key is written on paper and read back by someone
 * who has just lost their keychain, and that is the wrong moment to be deciding
 * whether a character is a letter or a digit.
 */
const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUPS: usize = 6;
const GROUP_SIZE: usize = 4;

/// Six groups of four from a 32-letter alphabet — 120 bits, written down once.
pub fn new_recovery_key() -> String {
    let mut bytes = [0u8; GROUPS * GROUP_SIZE];
    random(&mut bytes);

    // 256 divides by 32, so folding a byte into the alphabet is even. It would
    // not be for an alphabet of any other size, and the bias would be silent.
    let letters: Vec<u8> = bytes
        .iter()
        .map(|byte| ALPHABET[*byte as usize % ALPHABET.len()])
        .collect();

    letters
        .chunks(GROUP_SIZE)
        .map(|group| String::from_utf8_lossy(group).into_owned())
        .collect::<Vec<_>>()
        .join("-")
}

/*
 * What JavaScript's `\s` matches, which is not quite what Rust calls
 * whitespace: it strips the byte-order mark and leaves U+0085 alone, and Rust
 * does the opposite. Neither is likely in a key typed off paper, and both are
 * possible in one pasted out of a document — and a recovery key that works
 * under one backend and not the other is precisely the failure this port has
 * to not have.
 */
fn is_js_whitespace(c: char) -> bool {
    c == '\u{feff}' || (c.is_whitespace() && c != '\u{85}')
}

/// Dashes, spaces and case are how it was written down, not what it means.
pub fn normalize_recovery_key(key: &str) -> String {
    key.chars()
        .filter(|c| !is_js_whitespace(*c) && *c != '-')
        .flat_map(char::to_uppercase)
        .collect()
}

/// The key that wraps the vault key, derived from what was written down.
///
/// scrypt rather than a plain hash: the recovery key lives on paper and its
/// wrapped copy lives in the vault, which travels, so the cost of guessing has
/// to be paid in memory as well as time.
///
/// The parameters are Node's defaults — N=16384, r=8, p=1 — because the
/// TypeScript passes none and a vault sealed there must open here.
pub fn recovery_key_to_cipher_key(key: &str, salt: &[u8]) -> Result<Vec<u8>, String> {
    let params = scrypt::Params::new(14, 8, 1).map_err(|e| e.to_string())?;
    let mut derived = vec![0u8; KEY_BYTES];
    scrypt::scrypt(
        normalize_recovery_key(key).as_bytes(),
        salt,
        &params,
        &mut derived,
    )
    .map_err(|e| e.to_string())?;
    Ok(derived)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> Vec<u8> {
        new_key()
    }

    #[test]
    fn comes_back_exactly_as_it_went_in() {
        let key = key();
        let plain = b"# Slow morning\n\nCoffee. Empty streets.\n";

        assert_eq!(unseal(&seal(plain, &key).unwrap(), &key).unwrap(), plain);
    }

    #[test]
    fn carries_bytes_as_happily_as_words() {
        // Images live in the vault too, and go through the same envelope.
        let key = key();
        let plain = [0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x01];

        assert_eq!(unseal(&seal(&plain, &key).unwrap(), &key).unwrap(), plain);
    }

    #[test]
    fn looks_like_nothing_of_what_it_holds() {
        let envelope = seal(b"Half-formed ideas.", &key()).unwrap();

        assert!(!envelope.contains("Half-formed"));
        assert!(looks_encrypted(envelope.as_bytes()));
    }

    #[test]
    fn seals_the_same_words_differently_every_time() {
        // A fresh nonce each write, so two notes that say the same thing do
        // not announce that they do.
        let key = key();

        assert_ne!(seal(b"Coffee.", &key), seal(b"Coffee.", &key));
    }

    #[test]
    fn refuses_a_key_that_is_not_the_one_it_was_sealed_with() {
        let envelope = seal(b"Coffee.", &key()).unwrap();

        assert!(unseal(&envelope, &key()).is_err());
    }

    #[test]
    fn refuses_a_key_of_the_wrong_length_rather_than_padding_it() {
        assert!(seal(b"Coffee.", b"too short").is_err());
        assert!(seal(b"Coffee.", &[0u8; 64]).is_err());
    }

    #[test]
    fn the_recovery_key_is_six_groups_of_four_that_cannot_be_misread() {
        let key = new_recovery_key();
        let groups: Vec<&str> = key.split('-').collect();

        assert_eq!(groups.len(), GROUPS);
        assert!(groups.iter().all(|g| g.len() == GROUP_SIZE));
        // No I, O, 0 or 1: it is read off paper by someone having a bad day.
        assert!(!key.contains(['I', 'O', '0', '1']));
        assert!(key
            .chars()
            .all(|c| c == '-' || ALPHABET.contains(&(c as u8))));
    }

    #[test]
    fn the_recovery_key_is_a_different_one_every_time() {
        assert_ne!(new_recovery_key(), new_recovery_key());
    }

    #[test]
    fn wrapping_and_unwrapping_a_vault_key_with_what_was_written_down() {
        let vault_key = new_key();
        let salt = new_salt();
        let written = new_recovery_key();

        let wrapping = recovery_key_to_cipher_key(&written, &salt).unwrap();
        let envelope = seal(&vault_key, &wrapping).unwrap();

        // Typed back in the shape a reader would type it, not the shape it
        // was handed over in.
        let typed = recovery_key_to_cipher_key(&written.to_lowercase().replace('-', " "), &salt);
        assert_eq!(unseal(&envelope, &typed.unwrap()).unwrap(), vault_key);
    }

    #[test]
    fn a_different_salt_derives_a_different_key() {
        let written = new_recovery_key();

        assert_ne!(
            recovery_key_to_cipher_key(&written, &new_salt()).unwrap(),
            recovery_key_to_cipher_key(&written, &new_salt()).unwrap()
        );
    }

    /*
     * The fixture. See conformance/crypto.json for what it is and why it is
     * shaped the way it is; the short version is that these envelopes were
     * written by the other backend, and opening them is the only check that
     * catches the failure that actually matters.
     */
    mod conformance {
        use super::*;
        use serde_json::Value;

        fn fixture() -> Value {
            let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/crypto.json");
            serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
        }

        fn decoded(value: &Value, field: &str) -> Vec<u8> {
            B64.decode(value[field].as_str().expect(field))
                .expect(field)
        }

        #[test]
        fn opens_every_sealed_file_in_the_fixture() {
            let doc = fixture();
            let envelopes = doc["envelopes"].as_array().expect("envelopes");
            assert!(envelopes.iter().any(|e| e["from"] == "node"));

            for case in envelopes {
                let opened = unseal(
                    case["envelope"].as_str().expect("envelope"),
                    &decoded(case, "key"),
                );
                assert_eq!(
                    opened.as_deref(),
                    Ok(decoded(case, "plain").as_slice()),
                    "sealed by {}",
                    case["from"]
                );
            }
        }

        #[test]
        fn refuses_every_file_the_fixture_says_to_refuse() {
            for case in fixture()["refused"].as_array().expect("refused") {
                let opened = unseal(
                    case["envelope"].as_str().expect("envelope"),
                    &decoded(case, "key"),
                );
                assert!(opened.is_err(), "opened one it should not: {}", case["why"]);
            }
        }

        #[test]
        fn derives_the_same_key_from_the_same_words() {
            for case in fixture()["scrypt"].as_array().expect("scrypt") {
                let written = case["recoveryKey"].as_str().expect("recoveryKey");
                let derived = recovery_key_to_cipher_key(written, &decoded(case, "salt")).unwrap();

                assert_eq!(
                    B64.encode(derived),
                    case["derived"].as_str().expect("derived"),
                    "for {written}"
                );
            }
        }

        #[test]
        fn agrees_on_what_an_encrypted_file_looks_like() {
            for case in fixture()["looksEncrypted"]
                .as_array()
                .expect("looksEncrypted")
            {
                let text = case["text"].as_str().expect("text");
                assert_eq!(looks_encrypted(text.as_bytes()), case["is"], "for {text:?}");
            }
        }

        #[test]
        fn agrees_on_what_a_written_down_key_means() {
            for case in fixture()["normalizeRecoveryKey"]
                .as_array()
                .expect("normalizeRecoveryKey")
            {
                let written = case["written"].as_str().expect("written");
                assert_eq!(
                    normalize_recovery_key(written),
                    case["means"].as_str().expect("means"),
                    "for {written:?}"
                );
            }
        }
    }
}
