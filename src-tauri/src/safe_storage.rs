/*!
The OS keychain — a port of what Electron's `safeStorage` does on macOS.

`vault_keys` uses it for exactly one thing: remembering a vault key so this
machine is asked for the recovery key once rather than once per launch. That
file sits beside the app rather than in the vault, and the keychain is what
makes it safe to keep there — a stolen folder carries no key it could give up.

The format is Chromium's, because Electron's is, and both backends read the
same `vault-keys.json` while the port is in flight:

```text
"v10" ++ AES-128-CBC( PBKDF2-HMAC-SHA1(password, "saltysalt", 1003, 16) )
```

with an IV of sixteen spaces and PKCS#7 padding. The password is a random one
Chromium generated the first time it needed one, and keeps in the login
keychain. None of those numbers is a choice this file gets to make.

The scheme and the keychain are kept apart below. The scheme is the half that
has to agree with Electron byte for byte, and keeping it free of the keychain
is what lets `conformance/safe-storage.json` hold it to that.
*/

use aes::cipher::block_padding::Pkcs7;
use aes::cipher::{BlockModeDecrypt, BlockModeEncrypt, KeyIvInit};

const PREFIX: &[u8] = b"v10";
const SALT: &[u8] = b"saltysalt";
const ROUNDS: u32 = 1003;
const KEY_BYTES: usize = 16;
/// Not a nonce. Chromium uses a constant, and matching it is the job.
const IV: [u8; 16] = [b' '; 16];

type Encryptor = cbc::Encryptor<aes::Aes128>;
type Decryptor = cbc::Decryptor<aes::Aes128>;

fn derive(password: &[u8]) -> [u8; KEY_BYTES] {
    let mut key = [0u8; KEY_BYTES];
    // Only fails for a zero round count, which is not one of ours.
    let _ = pbkdf2::pbkdf2::<hmac::Hmac<sha1::Sha1>>(password, SALT, ROUNDS, &mut key);
    key
}

fn wrap(password: &[u8], value: &str) -> Vec<u8> {
    let body = Encryptor::new(&derive(password).into(), &IV.into())
        .encrypt_padded_vec::<Pkcs7>(value.as_bytes());

    [PREFIX, &body].concat()
}

fn unwrap(password: &[u8], blob: &[u8]) -> Option<String> {
    let body = blob.strip_prefix(PREFIX)?;
    let plain = Decryptor::new(&derive(password).into(), &IV.into())
        .decrypt_padded_vec::<Pkcs7>(body)
        .ok()?;

    String::from_utf8(plain).ok()
}

/*
 * Fetched once. The keychain is slow, may put a prompt on screen, and gives
 * the same answer every time — and `is_available` is asked before every write.
 */
#[cfg(target_os = "macos")]
fn from_keychain() -> Option<&'static [u8]> {
    use std::sync::LazyLock;

    /*
     * Electron names its keychain item after the app, and the app is "tova" in
     * development and "Tova" packaged. Pinned to the first for the same reason
     * `data_dir` is pinned to Electron's userData: both backends have to find
     * the same one, and it moves when the Electron side is gone, not before.
     *
     * Declared in here rather than beside the module's other constants so the
     * name exists only where something reads it — CI compiles this on Linux,
     * where there is no keychain and an unused constant fails the build.
     */
    const SERVICE: &str = "tova Safe Storage";
    const ACCOUNT: &str = "tova Key";

    static PASSWORD: LazyLock<Option<Vec<u8>>> = LazyLock::new(|| {
        security_framework::passwords::get_generic_password(SERVICE, ACCOUNT).ok()
    });

    PASSWORD.as_deref()
}

/*
 * Everywhere else there is no keychain of this kind to read. Electron answers
 * the same way on a Linux box with no secret service, and behaves as this
 * backend does there: the vault opens with its recovery key, and is asked for
 * again next launch.
 */
#[cfg(not(target_os = "macos"))]
// Unreachable while the tests use a stand-in, which they always do. Kept
// rather than cfg'd away so both halves of `password` always exist.
#[cfg_attr(test, allow(dead_code))]
fn from_keychain() -> Option<&'static [u8]> {
    None
}

/*
 * Tests get a password of their own, and the login keychain is left alone.
 *
 * Not for convenience. A unit test that reads the real keychain puts a prompt
 * on somebody's screen, answers one way on this machine and another on the
 * build machine, and tells you nothing either way — the thing worth knowing
 * about the real keychain is whether Electron and this backend find the same
 * item, and no unit test can see that. The ignored test below is what asks.
 */
#[cfg(test)]
static STAND_IN: std::sync::Mutex<Option<&'static [u8]>> = std::sync::Mutex::new(None);

#[cfg(test)]
pub fn stand_in(password: Option<&'static [u8]>) {
    *STAND_IN.lock().unwrap_or_else(|e| e.into_inner()) = password;
}

fn password() -> Option<&'static [u8]> {
    #[cfg(test)]
    {
        *STAND_IN.lock().unwrap_or_else(|e| e.into_inner())
    }
    #[cfg(not(test))]
    {
        from_keychain()
    }
}

pub fn is_available() -> bool {
    password().is_some()
}

pub fn encrypt_string(value: &str) -> Option<Vec<u8>> {
    Some(wrap(password()?, value))
}

pub fn decrypt_string(value: &[u8]) -> Option<String> {
    unwrap(password()?, value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine;

    /// A password of the shape Chromium generates: sixteen random bytes,
    /// base64'd, and kept as those twenty-four characters.
    const PASSWORD: &[u8] = b"c2hvcnQtbGl2ZWQtdGVzdA==";

    #[test]
    fn what_it_wraps_it_unwraps() {
        let wrapped = wrap(PASSWORD, "Coffee. Empty streets.");

        assert_eq!(
            unwrap(PASSWORD, &wrapped).as_deref(),
            Some("Coffee. Empty streets.")
        );
    }

    #[test]
    fn it_says_which_scheme_wrapped_it() {
        assert!(wrap(PASSWORD, "Coffee.").starts_with(PREFIX));
    }

    #[test]
    fn a_blob_from_some_other_scheme_is_not_ours_to_open() {
        // No prefix, or a prefix from the Linux variant this does not speak.
        assert_eq!(unwrap(PASSWORD, b"just some bytes"), None);
        assert_eq!(unwrap(PASSWORD, b"v11rubbish"), None);
    }

    #[test]
    fn a_different_password_opens_nothing() {
        // Unauthenticated, unlike the vault's own envelope, so the only guard
        // is the padding — which is why a wrong key is usually, not always, a
        // failure here. vault_keys checks the length of what comes back.
        let wrapped = wrap(PASSWORD, "Coffee. Empty streets.");

        assert_ne!(
            unwrap(b"a-different-keychain-key", &wrapped).as_deref(),
            Some("Coffee. Empty streets.")
        );
    }

    #[test]
    fn it_carries_a_vault_key_the_shape_vault_keys_hands_it() {
        // The only thing this is ever asked to hold.
        let key = B64.encode([7u8; 32]);

        assert_eq!(unwrap(PASSWORD, &wrap(PASSWORD, &key)), Some(key));
    }

    /*
     * The half no fixture can check: that Electron's safeStorage is the thing
     * this file is a port of, and reads the item this file reads.
     *
     * Run, and it passes: Rust wrapped the same string to exactly the bytes
     * Electron did. The scheme has no nonce, so identical output proves both
     * directions at once — each backend will read what the other remembered.
     *
     * It failed the first time, and on the tool rather than on this file. Run
     * as `electron tools/…`, `app.getName()` is "Electron", so safeStorage
     * reached for `Electron Safe Storage` — a key with nothing to do with
     * Tova — and the comparison was between two different keys. The tool sets
     * the name now. Worth knowing if this ever fails again: check which
     * keychain item each side actually used before suspecting the cipher.
     *
     * Still ignored, because it needs a login keychain, an Electron, and
     * somebody to run the two in order:
     *
     *   npx electron tools/safe-storage-vectors.js
     *   TOVA_ELECTRON_BLOB=<the blob it printed> \
     *     cargo test --manifest-path src-tauri/Cargo.toml \
     *     opens_what_electron_wrapped -- --ignored --nocapture
     *
     * A failure here means a vault sealed under one backend asks for its
     * recovery key under the other. Nothing is lost — but nothing about that
     * would announce itself, either.
     */
    #[test]
    #[ignore = "needs a login keychain and a blob from Electron"]
    #[cfg(target_os = "macos")]
    fn opens_what_electron_wrapped() {
        let blob = std::env::var("TOVA_ELECTRON_BLOB")
            .expect("set TOVA_ELECTRON_BLOB to what tools/safe-storage-vectors.js printed");
        let password = from_keychain().expect("no keychain item — has Electron ever run?");

        assert_eq!(
            unwrap(password, &B64.decode(blob).expect("base64")).as_deref(),
            Some("tova-safe-storage-conformance")
        );
        // And the other direction, for whoever is holding the terminal: hand
        // this back to the script to confirm Electron opens what Rust wrapped.
        println!(
            "rust wrapped: {}",
            B64.encode(wrap(password, "tova-safe-storage-conformance"))
        );
    }

    /*
     * The fixture pins the scheme against an implementation that is not this
     * one. See conformance/safe-storage.json for what that does and does not
     * prove — the short version is that it says this is a correct
     * implementation of Chromium's scheme, and says nothing about whether
     * Electron implements that scheme. Only Electron can answer that.
     */
    mod conformance {
        use super::*;
        use serde_json::Value;

        #[test]
        fn opens_every_blob_in_the_fixture() {
            let path = concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../conformance/safe-storage.json"
            );
            let doc: Value = serde_json::from_str(&std::fs::read_to_string(path).expect("fixture"))
                .expect("json");

            let cases = doc["wrapped"].as_array().expect("wrapped");
            assert!(!cases.is_empty());

            for case in cases {
                let password = case["password"].as_str().expect("password").as_bytes();
                let blob = B64
                    .decode(case["blob"].as_str().expect("blob"))
                    .expect("blob");
                let plain = case["plain"].as_str().expect("plain");

                assert_eq!(
                    unwrap(password, &blob).as_deref(),
                    Some(plain),
                    "from {}",
                    case["from"]
                );
                // And the same input wraps to the same bytes: the scheme has
                // no nonce, so unlike the vault envelope this one is pinnable.
                assert_eq!(
                    B64.encode(wrap(password, plain)),
                    case["blob"],
                    "from {}",
                    case["from"]
                );
            }
        }
    }
}
