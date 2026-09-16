#!/usr/bin/env node
/*
 * Cutting a release: build, sign, notarize, staple, and hand GitHub a draft.
 *
 *   node scripts/release.mjs --check     what it would do, and whether it can
 *   node scripts/release.mjs             the whole thing
 *
 * It runs here rather than on a CI runner on purpose. The Developer ID
 * certificate is the one credential that cannot be rotated quietly — a copy of
 * it in a CI secret is a copy somebody else could sign with, and every build
 * ever shipped stops being trusted the day Apple revokes it. It stays on this
 * machine.
 *
 * The release is left as a **draft**. Publishing is the one step that reaches
 * people who are not you, and it is a button rather than a side effect.
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TARGET = "universal-apple-darwin"
const NOTARY_PROFILE = "tova"
const IDENTITY = "Developer ID Application: Mark McDermott (VRFF4MSHAC)"

const root = new URL("..", import.meta.url).pathname
const bundle = `${root}src-tauri/target/${TARGET}/release/bundle`

const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: "utf-8", cwd: root, ...options }).trim()

/** Runs a command for its answer, and treats failure as "no". */
const quiet = (command, args) => {
  try {
    return run(command, args, { stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return null
  }
}

let failures = 0
/** `detail` is what to do about it, so it is only worth saying when it failed. */
function check(what, ok, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${!ok && detail ? ` — ${detail}` : ""}`)
  return ok
}

/*
 * What this version's release page should say, if anybody has written it.
 *
 * A release with no notes says its own version number back to whoever opened
 * it, which is the least a release page could do. Kept in the repository
 * rather than typed at the prompt: the notes are part of what shipped, and
 * worth reviewing before they are published rather than after.
 */
function notesFor(version) {
  const path = `${root}docs/releases/${version}.md`
  return existsSync(path) ? readFileSync(path, "utf-8").trim() : null
}

function conf() {
  return JSON.parse(readFileSync(`${root}src-tauri/tauri.conf.json`, "utf-8"))
}

function preflight() {
  const version = conf().version
  console.log(`Releasing Tova ${version}\n`)

  check("macOS", process.platform === "darwin")

  const branch = quiet("git", ["branch", "--show-current"])
  check("on main", branch === "main", branch ?? "no branch")
  check("working tree clean", quiet("git", ["status", "--porcelain"]) === "")
  quiet("git", ["fetch", "--quiet", "origin"])
  const behind = quiet("git", ["rev-list", "--count", "HEAD..origin/main"])
  check("up to date with origin", behind === "0", `${behind} commits behind origin/main`)

  // A tag that already exists means this version has been cut before, and
  // overwriting a release people may already have is not something to do by
  // accident.
  const tag = `v${version}`
  check(
    `${tag} is not already released`,
    quiet("gh", ["release", "view", tag]) === null,
    "a release with this version exists"
  )

  const identities = quiet("security", ["find-identity", "-v", "-p", "codesigning"]) ?? ""
  check("Developer ID in the keychain", identities.includes(IDENTITY))

  // `notarytool history` validates the stored credentials against Apple, so
  // this catches an expired agreement here rather than after a full build.
  check(
    `notarytool profile "${NOTARY_PROFILE}"`,
    quiet("xcrun", ["notarytool", "history", "--keychain-profile", NOTARY_PROFILE]) !== null,
    "run: xcrun notarytool store-credentials"
  )

  const key = process.env.TAURI_SIGNING_PRIVATE_KEY
  const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
  check(
    "updater signing key in the environment",
    Boolean(key || (keyPath && existsSync(keyPath))),
    "set TAURI_SIGNING_PRIVATE_KEY from your password manager"
  )
  check(
    "updater key password in the environment",
    Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD),
    "set TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
  )

  check("gh is signed in", quiet("gh", ["auth", "status"]) !== null)

  /*
   * A warning rather than a failure: a release with no notes is a poor release
   * page, not a broken build. Said here so it can be fixed before the wait for
   * Apple rather than after.
   */
  if (notesFor(version) === null) {
    console.log(
      `  note docs/releases/${version}.md is missing — the page will say only "Tova ${version}"`
    )
  }

  const pubkey = conf().plugins?.updater?.pubkey ?? ""
  check("updater public key is set", pubkey.length > 40 && !pubkey.includes("GOES_HERE"))

  return { version, tag, ok: failures === 0 }
}

/*
 * Building.
 *
 * The signing identity and the updater key are handed in as environment, which
 * is what `cargo tauri build` reads. Universal: one binary carrying both
 * architectures, which is what ships — building a single one is half the size
 * and half the wait and is not the thing to put on a release page.
 */
function build() {
  console.log("\nBuilding — this takes a few minutes.")
  // `createUpdaterArtifacts` is asked for here rather than left on in
  // tauri.conf.json: with it on in the file, every ordinary `tauri:build`
  // refuses to finish without the updater key, which is a thing only a release
  // needs. Wanting a production build to look at is not wanting to sign one.
  execFileSync(
    "cargo",
    [
      "tauri",
      "build",
      "--target",
      TARGET,
      "--config",
      JSON.stringify({ bundle: { createUpdaterArtifacts: true } })
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, APPLE_SIGNING_IDENTITY: IDENTITY } }
  )
}

/**
 * Whether the app actually runs, rather than merely being well formed.
 *
 * A bundle that packages the wrong `out/renderer` is signed, notarized and
 * stapled exactly like one that packages the right one, and opens to a blank
 * window. Neither `session.json` nor the day's note is written unless the
 * renderer booted and called through the bridge, so waiting for one of those
 * is the check a signature cannot make. A scratch HOME, so this never writes
 * into the vault of whoever is cutting the release.
 */
function boots(app) {
  const home = mkdtempSync(join(tmpdir(), "tova-release-"))
  const session = join(home, "Library/Application Support/tova/session.json")
  const child = spawn(join(app, "Contents/MacOS/tova"), [], {
    env: { ...process.env, HOME: home },
    stdio: "ignore",
    detached: true
  })

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && !existsSync(session)) {
    execFileSync("sleep", ["0.25"])
  }
  const booted = existsSync(session)

  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    child.kill("SIGTERM")
  }
  rmSync(home, { recursive: true, force: true })
  return booted
}

function verifyBundle(app) {
  console.log("\nThe bundle:")
  const archs = quiet("lipo", ["-archs", join(app, "Contents/MacOS/tova")]) ?? ""
  check("universal", archs.includes("x86_64") && archs.includes("arm64"), archs)
  check("signed", quiet("codesign", ["--verify", "--deep", "--strict", app]) !== null)
  check("it opens and writes a session", boots(app))
}

function notarize(dmg) {
  console.log("\nNotarizing — Apple decides how long this takes.")
  execFileSync(
    "xcrun",
    ["notarytool", "submit", dmg, "--keychain-profile", NOTARY_PROFILE, "--wait"],
    {
      stdio: "inherit"
    }
  )
  execFileSync("xcrun", ["stapler", "staple", dmg], { stdio: "inherit" })
}

/*
 * Gatekeeper's answer, asked the way a stranger's Mac asks it.
 *
 * On a copy carrying the quarantine attribute, because that is what a download
 * has and a locally built file does not — without it this passes on a machine
 * where the certificate is in the keychain regardless of whether notarization
 * worked.
 */
function verifyGatekeeper(dmg) {
  console.log("\nGatekeeper:")
  const copy = join(mkdtempSync(join(tmpdir(), "tova-gate-")), "Tova.dmg")
  execFileSync("cp", [dmg, copy])
  execFileSync("xattr", ["-w", "com.apple.quarantine", "0081;00000000;Safari;", copy])
  const verdict = quiet("spctl", [
    "-a",
    "-t",
    "open",
    "--context",
    "context:primary-signature",
    "-v",
    copy
  ])
  check("accepted on a quarantined copy", verdict !== null)
  rmSync(join(copy, ".."), { recursive: true, force: true })
}

/**
 * The file the updater reads. Both architectures name the same universal
 * tarball, because there is one build and it carries both.
 */
function latestJson(version, tag, tarball) {
  const signature = readFileSync(`${tarball}.sig`, "utf-8").trim()
  const url = `https://github.com/mark-mcdermott/tova/releases/download/${tag}/${tarball.split("/").pop()}`
  const platform = { signature, url }

  return JSON.stringify(
    {
      version,
      notes: `Tova ${version}`,
      pub_date: new Date().toISOString(),
      platforms: { "darwin-aarch64": platform, "darwin-x86_64": platform }
    },
    null,
    2
  )
}

const [, , ...argv] = process.argv

const { version, tag, ok } = preflight()

if (!ok) {
  console.log(`\n${failures} check(s) failed. Nothing was built.`)
  process.exitCode = 1
} else if (argv.includes("--check")) {
  console.log("\nEverything a release needs is here.")
} else {
  build()

  const app = `${bundle}/macos/Tova.app`
  const dmg = `${bundle}/dmg/Tova_${version}_universal.dmg`
  const tarball = `${bundle}/macos/Tova.app.tar.gz`

  verifyBundle(app)
  if (failures > 0) {
    console.log("\nThe bundle is not right. Nothing was notarized or uploaded.")
    process.exit(1)
  }

  notarize(dmg)
  verifyGatekeeper(dmg)
  if (failures > 0) {
    console.log("\nGatekeeper refused it. Nothing was uploaded.")
    process.exit(1)
  }

  const manifest = join(tmpdir(), "latest.json")
  writeFileSync(manifest, latestJson(version, tag, tarball))

  const notes = notesFor(version)
  const notesPath = `${root}docs/releases/${version}.md`

  console.log("\nDrafting the release.")
  execFileSync(
    "gh",
    [
      "release",
      "create",
      tag,
      "--draft",
      "--title",
      `Tova ${version}`,
      "--notes",
      `Tova ${version}`,
      dmg,
      tarball,
      `${tarball}.sig`,
      manifest
    ],
    { cwd: root, stdio: "inherit" }
  )

  console.log(`\nDrafted ${tag}. Nothing is public until you press publish.`)
}
