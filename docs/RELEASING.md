# Cutting a release

```sh
pnpm run release -- --check     # what it would do, and whether it can
pnpm run release                # the whole thing
```

It builds universal, signs, notarizes, staples, checks Gatekeeper's answer,
writes `latest.json`, and leaves a **draft** release on GitHub. Publishing is a
button you press, not a side effect of running a script.

## Why this is a script and not a workflow

The Developer ID certificate is the one credential that cannot be rotated
quietly. A copy in a CI secret is a copy somebody else could sign with, and a
revoked signing identity means every build ever shipped stops being trusted. It
stays on this machine.

The cost is that releases come from one Mac. That is the trade.

## What you need

Most of it is already set up and `--check` will tell you which parts are not.

- **The Developer ID** in the keychain. `security find-identity -v -p codesigning`
  should list `Developer ID Application: Mark McDermott (VRFF4MSHAC)`. The Team
  ID is not a secret — it is in the signature of every build.
- **A notarytool profile** called `tova`:

  ```sh
  xcrun notarytool store-credentials "tova" --apple-id "<your apple id>" --team-id "VRFF4MSHAC"
  ```

  It validates against Apple as it saves, so it doubles as an account check.

- **The updater key**, from your password manager, in the environment for the
  run only:

  ```sh
  TAURI_SIGNING_PRIVATE_KEY="$(pbpaste)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…" \
  pnpm run release
  ```

  It is not read from a file on disk, and no step writes it anywhere.

## What it checks before building

On main, clean, up to date; the version is not already released; the signing
identity and notary profile work; the updater key and its password are present;
`gh` is signed in; and the updater's public key is really in the config rather
than a placeholder. Any failure stops it before anything is built.

## What it checks after

That the binary carries both architectures, that the bundle is signed, **and
that the app opens and writes a session**. That last one is the check a
signature cannot make: a bundle packaging the wrong `out/renderer` is signed,
notarized and stapled exactly like a good one, and opens to a blank window.
Nothing writes `session.json` unless the renderer booted and called through the
bridge. It runs with a scratch `HOME`, so it never touches your vault.

Then Gatekeeper, asked on a copy carrying the quarantine attribute — because
that is what a download has and a locally built file does not. Without it the
check passes on the machine that holds the certificate no matter what.

## `createUpdaterArtifacts`

Asked for per build, by the script, rather than left on in `tauri.conf.json`.
With it on in the file every ordinary `pnpm run tauri:build` refuses to finish
without the updater key — and wanting a production build to look at is not the
same as wanting to sign one.

## The grammar dictionary

```sh
pnpm run release:grammar
```

Harper's 15.6MB dictionary is not in the app download; it is fetched the first
time somebody turns grammar on. The app asks Tova's own release first and the
npm registry second, and until that release exists everyone gets it from the
registry — which works, and is held to the same hash, but means somebody else
serves it.

This puts it on a release tagged after the **dictionary's** version rather than
Tova's, because the app asks for a specific dictionary and that URL should keep
working across Tova releases that want the same one.

The version and hash are read out of `grammar.rs`, and the downloaded bytes are
checked against them before anything is uploaded. A release carrying bytes the
app would refuse is worse than no release, because the fallback would have
worked.
