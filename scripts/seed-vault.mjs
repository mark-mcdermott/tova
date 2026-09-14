#!/usr/bin/env node
/*
 * Fills a Tova vault with test material.
 *
 * The point is QA by hand: every markdown construct, every shape of tag block,
 * every image format the vault accepts, notes that are too long and notes that
 * are empty, and a few files whose bytes are wrong on purpose.
 *
 * It only ever creates. Nothing here deletes or truncates a note, so pointing
 * it at a vault with real writing in it costs you nothing but clutter — and it
 * refuses to do even that without --force.
 *
 *   node scripts/seed-vault.mjs
 *   node scripts/seed-vault.mjs --vault "~/Documents/Tova QA"
 *   node scripts/seed-vault.mjs --force
 */
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { writeImages } from "./seed/images.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = join(here, "seed", "vault")

const SECTIONS = ["daily", "ideas", "journal", "notes", "posts", "trash"]

/*
 * Git does not track an empty directory, so the one case that needs a folder
 * with nothing in it cannot live in the template. Clicking this in the sidebar
 * should make a first note and open it, rather than showing an empty index.
 */
const EMPTY_FOLDERS = ["notes/empty-folder"]

function usage() {
  console.log(
    [
      "Fills a Tova vault with test material.",
      "",
      "  --vault <path>   Which vault to fill. Default: $TOVA_VAULT, or ~/Documents/Tova",
      "  --force          Write even though the vault already holds notes",
      "  --help           This",
      "",
      "Only ever creates files. Never deletes or truncates one."
    ].join("\n")
  )
}

function options(argv) {
  const chosen = {
    vault: process.env.TOVA_VAULT ?? join(homedir(), "Documents", "Tova"),
    force: false,
    help: false
  }

  for (let at = 0; at < argv.length; at++) {
    // `pnpm run seed -- --force` forwards the separator itself.
    if (argv[at] === "--") continue
    else if (argv[at] === "--force") chosen.force = true
    else if (argv[at] === "--help") chosen.help = true
    else if (argv[at] === "--vault") {
      chosen.vault = argv[++at]
      if (chosen.vault === undefined) throw new Error("--vault needs a path")
    } else throw new Error(`Unknown argument: ${argv[at]}`)
  }

  return chosen
}

function notesUnder(root) {
  const found = []

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith(".md")) found.push(path)
    }
  }

  if (existsSync(root)) walk(root)
  return found
}

/*
 * Writes only where there is nothing. A vault being seeded a second time, or
 * one the app has already opened and put a daily note in, keeps what it has —
 * so "only ever creates" is true of every file and not just most of them.
 */
const kept = []

function create(path, contents) {
  if (existsSync(path)) {
    kept.push(path)
    return false
  }
  writeFileSync(path, contents)
  return true
}

const iso = (date) => date.toISOString().slice(0, 10)

function daysBefore(today, days) {
  const date = new Date(today)
  date.setDate(date.getDate() - days)
  return date
}

/*
 * Dates chosen to break the groupings a date list tends to have: a run of
 * consecutive days including today, a gap, both sides of a month boundary,
 * last year, and the most recent 29th of February.
 */
function dailyDates(today) {
  const dates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((days) => daysBefore(today, days))

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastOfPrevious = new Date(firstOfMonth)
  lastOfPrevious.setDate(0)
  const firstOfPrevious = new Date(lastOfPrevious.getFullYear(), lastOfPrevious.getMonth(), 1)

  dates.push(firstOfMonth, lastOfPrevious, firstOfPrevious)
  dates.push(new Date(today.getFullYear() - 1, 11, 31))
  dates.push(new Date(today.getFullYear() - 1, 6, 4))

  const leap = new Date(today.getFullYear(), 1, 29)
  for (let year = today.getFullYear(); year > today.getFullYear() - 8; year--) {
    const candidate = new Date(year, 1, 29)
    if (candidate.getMonth() === 1 && candidate < today) {
      leap.setFullYear(year)
      dates.push(candidate)
      break
    }
  }

  const unique = new Map(dates.map((date) => [iso(date), date]))
  return [...unique.values()].sort((a, b) => b - a)
}

const dailyBodies = [
  "Short one. Ran, wrote, ate, slept.\n",
  "#ephemeral\n\nA block tag in a daily note, owning everything to the end of\nthe day's entry. A purge should take this whole note's body but leave\nthe note itself, since the tag is not in its row.\n",
  "Rained all day.\n\n- [x] Walked anyway\n- [ ] Wrote anything worth keeping\n",
  "",
  "Talked to Sam about the release. Notes:\n\n> Ship the thing, then write about shipping the thing.\n\nMentioned #work inline, which owns nothing.\n",
  "#keep\n\nA block that survives a purge of ephemeral.\n\n---\n\nAnd prose after the rule, which survives either way.\n"
]

function writeDailies(vault, today) {
  const dates = dailyDates(today)

  dates.forEach((date, index) => {
    const name = iso(date)
    const body = dailyBodies[index % dailyBodies.length]
    const front = ["---", `title: ${name}`, "section: daily", "tags: [daily]", "---", "", ""]
    create(join(vault, "daily", `${name}.md`), front.join("\n") + body)
  })

  return dates.length
}

const front = (title, section, tags, extra = "") =>
  `---\ntitle: ${title}\nsection: ${section}\ntags: [${tags.join(", ")}]\n${extra}---\n\n`

/*
 * Files whose bytes are the test. These are generated rather than kept in the
 * template because git normalises line endings and editors strip final
 * newlines — the very things being checked.
 */
function writeOddities(vault) {
  const markdown = join(vault, "notes", "markdown")
  const written = []
  let made = false

  const crlf = (
    front("CRLF line endings", "notes", ["edge"]) +
    "Every line in this file ends with a carriage return and a line feed, the\n" +
    "way a file written on Windows does.\n\n#ephemeral\n\nA block tag in a CRLF\n" +
    "file. The rule below has a carriage return on it too.\n\n---\n\nAfter the rule.\n"
  ).replace(/\n/g, "\r\n")
  if (create(join(markdown, "crlf-line-endings.md"), crlf)) written.push("crlf-line-endings.md")

  made = create(
    join(markdown, "byte-order-mark.md"),
    "﻿" +
      front("Byte order mark", "notes", ["edge"]) +
      "This file opens with a U+FEFF byte order mark, before the front matter\n" +
      "fence. Anything that compares the first line to `---` has to cope.\n"
  )
  if (made) written.push("byte-order-mark.md")

  made = create(
    join(markdown, "no-trailing-newline.md"),
    front("No trailing newline", "notes", ["edge"]) +
      "The last byte of this file is the full stop at the end of this sentence."
  )
  if (made) written.push("no-trailing-newline.md")

  const long = "supercalifragilisticexpialidocious".repeat(30)
  made = create(
    join(markdown, "very-long-lines.md"),
    front("Very long lines", "notes", ["layout"]) +
      "One paragraph, one line, no spaces to wrap at:\n\n" +
      `${long}\n\n` +
      "And a URL with nowhere to break:\n\n" +
      `https://example.com/${"segment/".repeat(60)}end?query=${"x".repeat(200)}\n\n` +
      "And an ordinary long paragraph. " +
      "The quick brown fox jumps over the lazy dog. ".repeat(80) +
      "\n"
  )
  if (made) written.push("very-long-lines.md")

  const paragraph =
    "The quick brown fox jumps over the lazy dog, and the dog, being lazy, " +
    "does not especially mind. This sentence exists to take up room.\n\n"
  const heading = (at) => `## Section ${at}\n\n`
  let big = front("A very large note", "notes", ["performance"])
  for (let at = 1; big.length < 200_000; at++) {
    big += heading(at) + paragraph.repeat(6)
    if (at % 5 === 0) big += "```js\nconst at = " + at + "\n```\n\n"
  }
  if (create(join(markdown, "a-very-large-note.md"), big)) {
    written.push(`a-very-large-note.md (${Math.round(big.length / 1024)}KB)`)
  }

  return written
}

function main() {
  let chosen
  try {
    chosen = options(process.argv.slice(2))
  } catch (why) {
    console.error(`${why.message}\n`)
    usage()
    process.exitCode = 1
    return
  }

  if (chosen.help) return usage()

  const vault = chosen.vault.replace(/^~(?=$|\/)/, homedir())
  const already = notesUnder(vault)

  if (already.length > 0 && !chosen.force) {
    console.error(`${vault}\n  already holds ${already.length} note(s).`)
    console.error("  Nothing was written. Pass --force to add the seed alongside them,")
    console.error("  or --vault <path> to fill a different one.")
    process.exitCode = 1
    return
  }

  for (const section of SECTIONS) mkdirSync(join(vault, section), { recursive: true })
  for (const folder of EMPTY_FOLDERS) mkdirSync(join(vault, folder), { recursive: true })

  const identity = join(vault, ".tova-vault")
  if (!existsSync(identity)) writeFileSync(identity, crypto.randomUUID())

  cpSync(TEMPLATE, vault, { recursive: true, force: false, errorOnExist: false })

  const assets = join(vault, "assets")
  mkdirSync(assets, { recursive: true })
  const images = writeImages(assets)

  const dailies = writeDailies(vault, new Date())
  const oddities = writeOddities(vault)

  console.log(`Seeded ${vault}`)
  console.log(`  ${notesUnder(vault).length} notes, including ${dailies} daily entries`)
  console.log(`  ${images.written.length} images in assets/`)
  if (images.skipped.length > 0) {
    console.log(`  skipped (no converter on this machine): ${images.skipped.join(", ")}`)
  }
  if (oddities.length > 0) console.log(`  byte-level cases: ${oddities.join(", ")}`)
  if (kept.length > 0) {
    console.log(`  left alone, already there: ${kept.length} file(s)`)
  }
}

main()
