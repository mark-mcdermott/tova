/*
 * Answers the one question conformance/safe-storage.json cannot: does
 * Electron's safeStorage actually use the scheme src-tauri/src/safe_storage.rs
 * implements, and does it read the keychain item that file reads?
 *
 * Nothing offline can answer it. The fixture proves the Rust is a correct
 * implementation of Chromium's documented format, and a correct implementation
 * of the wrong format would pass it just as happily.
 *
 * So this asks Electron directly. It wraps a known string with safeStorage,
 * prints the blob, and unwraps a blob produced by Rust. If both sides come out
 * as expected, the two backends will find each other's remembered vault keys.
 *
 * The keychain password itself is never printed and never leaves the process —
 * only the wrapped blobs, which is the same thing that already sits in
 * vault-keys.json. macOS may ask for permission the first time; that is the
 * login keychain being asked for an item this app owns.
 *
 *   npx electron tools/safe-storage-vectors.js [blob-to-unwrap-as-base64]
 */
const { app, safeStorage } = require("electron")

const PLAIN = "tova-safe-storage-conformance"

/*
 * The name decides which keychain item safeStorage reaches for: Chromium keys
 * it on `<app name> Safe Storage`. Run as `electron tools/…` the name is
 * "Electron", so without this the script wraps its blob with a key that has
 * nothing to do with Tova — and the comparison it exists to make is between
 * two different keys, which it will report as a mismatch.
 *
 * "tova", lower case, because that is what `app.getName()` gives in
 * development and what src-tauri reads. A packaged build is "Tova"; the two
 * are pinned together and both move when the Electron side is gone.
 */
app.setName("tova")

app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const answer = { available: safeStorage.isEncryptionAvailable() }

  if (answer.available) {
    answer.plain = PLAIN
    answer.blob = safeStorage.encryptString(PLAIN).toString("base64")

    const given = process.argv[2]
    if (given !== undefined) {
      try {
        answer.unwrapped = safeStorage.decryptString(Buffer.from(given, "base64"))
      } catch (error) {
        answer.unwrapped = null
        answer.error = error.message
      }
    }
  }

  console.log(JSON.stringify(answer, null, 2))
  app.exit(0)
})
