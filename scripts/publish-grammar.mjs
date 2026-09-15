#!/usr/bin/env node
/*
 * Puts Harper's dictionary on a Tova release, so grammar has a first source
 * rather than only a fallback.
 *
 *   node scripts/publish-grammar.mjs
 *
 * `grammar.rs` names the version and the hash it will accept, and those are
 * read from it rather than repeated here: a copy of a hash is a copy that can
 * disagree, and the one that matters is the one the app checks against.
 *
 * The release is left as a draft, like every other. Its tag is the dictionary's
 * version, not Tova's — the app asks for a specific dictionary, and that URL
 * should keep working across every Tova release that wants the same one.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = new URL("..", import.meta.url).pathname
const rust = readFileSync(`${root}src-tauri/src/grammar.rs`, "utf-8")

const field = (name, pattern) => {
  const found = pattern.exec(rust)
  if (found === null) throw new Error(`Could not read ${name} from grammar.rs`)
  return found[1]
}

const version = field("version", /version:\s*"([^"]+)"/)
const bytes = Number(field("bytes", /bytes:\s*([\d_]+)/).replace(/_/g, ""))
const sha256 = field("sha256", /sha256:\s*"([0-9a-f]{64})"/)
const name = "harper_wasm_slim_bg.wasm"
const tag = `grammar-${version}`

console.log(`Harper ${version} — ${bytes} bytes, sha256 ${sha256.slice(0, 12)}…`)

const source = `https://cdn.jsdelivr.net/npm/harper.js@${version}/dist/${name}`
console.log(`Fetching ${source}`)
const file = join(tmpdir(), name)
execFileSync("curl", ["-sL", source, "-o", file])

const got = readFileSync(file)
const digest = createHash("sha256").update(got).digest("hex")

// The same two checks the app makes, made before anything is uploaded: a
// release carrying bytes the app will refuse is worse than no release at all,
// because the fallback would have worked.
if (got.length !== bytes) throw new Error(`Expected ${bytes} bytes, got ${got.length}`)
if (digest !== sha256) throw new Error(`Expected ${sha256}, got ${digest}`)
console.log("The bytes are the ones grammar.rs expects.")

const notes = [
  `Harper ${version}'s slim WebAssembly, which Tova fetches the first time`,
  "somebody turns grammar on. It is not in the app download.",
  "",
  `sha256 \`${sha256}\``,
  "",
  "Checked against that hash before it is kept and again before it is run, so",
  "this is a copy rather than something to trust."
].join("\n")

const notesFile = join(tmpdir(), "grammar-notes.md")
writeFileSync(notesFile, notes)

execFileSync(
  "gh",
  [
    "release",
    "create",
    tag,
    "--draft",
    "--title",
    `Harper ${version}`,
    "--notes-file",
    notesFile,
    file
  ],
  { cwd: root, stdio: "inherit" }
)

console.log(`\nDrafted ${tag}. Nothing is public until you press publish.`)
