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
