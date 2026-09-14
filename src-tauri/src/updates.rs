/*!
Looking for a newer Tova, once, when the app opens.

Quietly on purpose. The update is fetched and put in place, and the reader
gets it the next time they open the app — nothing is replaced under somebody
who is mid-sentence, and there is no dialog interrupting a morning's writing
to ask about a version number.

This is the only thing Tova sends anywhere on its own. It sends a version and,
unavoidably, an IP address; it asks for a file and reads it. The reader can
turn it off, and then the app opens no sockets at all.

Nothing here is on the IPC surface. The renderer has no part in it beyond the
preference, which travels with every other preference.
*/

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/*
 * What sits in `tauri.conf.json` until somebody generates a signing key.
 *
 * A release built with this in place would reach the server, fetch a version,
 * and refuse it — every launch, forever, saying nothing. Better to know there
 * is no key and not ask.
 */
const NO_KEY_YET: &str = "PUBKEY_GOES_HERE";

/// Whether there is a key to check a download against.
fn configured(pubkey: &str) -> bool {
    let pubkey = pubkey.trim();
    !pubkey.is_empty() && pubkey != NO_KEY_YET
}

/// The updater's public key as the app was built with it.
fn pubkey_of(app: &AppHandle) -> String {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|pubkey| pubkey.as_str())
        .unwrap_or_default()
        .to_string()
}

/*
 * Every failure here is silent, which is deliberate rather than careless.
 *
 * An update check runs without being asked for, so anything it says is an
 * interruption the reader did not invite — and everything it can say is
 * something they cannot act on: the machine is offline, the release server is
 * down, the release is malformed. None of that is their business at the
 * moment they sat down to write. It reaches the log for whoever is reading
 * one, and the app goes on being the app.
 *
 * The exception is a signature that does not verify, which is not a network
 * problem and is worth saying out loud.
 */
pub fn look(app: &AppHandle, wanted: bool) {
    if !wanted {
        return;
    }

    if !configured(&pubkey_of(app)) {
        eprintln!("No updater signing key in this build; not looking for updates.");
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let updater = match app.updater() {
            Ok(updater) => updater,
            Err(why) => {
                eprintln!("Could not ask about updates: {why}");
                return;
            }
        };

        let found = match updater.check().await {
            Ok(Some(found)) => found,
            // Nothing newer, which is the ordinary answer and not worth a line.
            Ok(None) => return,
            Err(why) => {
                eprintln!("Could not look for updates: {why}");
                return;
            }
        };

        /*
         * Downloaded and put in place without being run. On macOS the bundle
         * is replaced while this copy keeps the code it already loaded, so the
         * app carries on unchanged and the next launch is the new one.
         */
        match found.download_and_install(|_, _| {}, || {}).await {
            Ok(()) => eprintln!("Tova {} is installed; it opens next time.", found.version),
            Err(why) => eprintln!("Could not install the update: {why}"),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * The placeholder is what ships until a key is generated, and a build
     * carrying it can reach the server, fetch a version and refuse it on every
     * launch without ever saying why. It is worth one comparison to not ask.
     */
    #[test]
    fn a_build_with_no_signing_key_does_not_go_looking() {
        assert!(!configured(NO_KEY_YET));
        assert!(!configured(""));
        assert!(!configured("   "));
    }

    #[test]
    fn a_build_with_one_does() {
        // The shape `tauri signer generate` writes: base64, no newlines.
        assert!(configured(
            "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDBEMEE="
        ));
    }
}
