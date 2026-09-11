/*!
The OS keychain, which this backend cannot reach yet.

Electron's `safeStorage` wraps a string with a key held in the login keychain,
and `vault_keys` uses it for exactly one thing: remembering a vault key so this
machine is asked for the recovery key once rather than once per launch.

It is a module of its own, and stubbed rather than inlined, for two reasons.
The shape is the seam the real one drops into — `vault_keys` is already the
whole port and does not change when this file does. And the branch it takes is
a branch the TypeScript has too: `safeStorage.isEncryptionAvailable()` is false
on a Linux box with no secret service, and Electron behaves there exactly as
this backend behaves everywhere, which is to say it forgets.

Until it lands, a vault sealed under Tauri opens with its recovery key and is
locked again on quit. That is a worse experience than Electron's and a correct
one: nothing here claims to hold a key it does not hold.
*/

pub fn is_available() -> bool {
    false
}

#[allow(dead_code)]
pub fn encrypt_string(_value: &str) -> Option<Vec<u8>> {
    None
}

#[allow(dead_code)]
pub fn decrypt_string(_value: &[u8]) -> Option<String> {
    None
}
