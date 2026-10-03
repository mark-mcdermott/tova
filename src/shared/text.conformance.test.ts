// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import { parseFrontMatter, serializeFrontMatter, type FrontMatterValue } from "./frontMatter"
import { compareTitles, slugify, sortKey, uniqueSlug } from "./noteName"
import { allTags, normalizeManualTags, normalizeTag } from "./tags"
import {
  isValidFolderName,
  parseNoteId,
  restoreLocation,
  sortNotes,
  toNoteId,
  trashLocation,
  type NoteLocation
} from "./noteLocation"
import type { NoteSummary } from "./types"

/*
 * The other half of `conformance/text.json`.
 *
 * Its readme is explicit that this side is the source of truth and the Rust is
 * held to it — and nothing was asking this side. Fourteen sections of answers
 * generated here once, frozen, and checked only against the port. A change to
 * any of these functions would have left the Rust passing against an answer
 * this side had stopped giving, which is precisely the drift the fixture
 * exists to catch.
 */
const fixture = JSON.parse(readFileSync("conformance/text.json", "utf-8")) as {
  parse: { raw: string; data: Record<string, FrontMatterValue>; body: string }[]
  serialize: { data: Record<string, FrontMatterValue>; body: string; text: string }[]
  slugify: { title: string; slug: string }[]
  uniqueSlug: { candidate: string; taken: string[]; unique: string }[]
  allTags: { manual: string[]; body: string; tags: string[] }[]
  normalizeTag: { input: string; tag: string | null }[]
  normalizeManualTags: { value: unknown; tags: string[] }[]
  parseNoteId: { id: string; location: NoteLocation | null; roundTrip: string | null }[]
  isValidFolderName: { name: string; valid: boolean }[]
  restoreLocation: {
    data: Record<string, FrontMatterValue>
    filename: string
    location: NoteLocation
  }[]
  trashLocation: { filename: string; location: NoteLocation }[]
  sortKey: { title: string; key: string }[]
  compareTitles: { titles: string[]; sorted: string[] }
  sortNotes: { notes: NoteSummary[]; order: string[] }
}

const short = (value: unknown) => JSON.stringify(value)?.slice(0, 52) ?? "undefined"

describe("front matter, against every case the Rust answers", () => {
  fixture.parse.forEach(({ raw, data, body }, at) => {
    it(`parse ${at}: ${short(raw)}`, () => {
      expect(parseFrontMatter(raw)).toEqual({ data, body })
    })
  })

  fixture.serialize.forEach(({ data, body, text }, at) => {
    it(`serialize ${at}: ${short(data)}`, () => {
      expect(serializeFrontMatter(data, body)).toBe(text)
    })
  })
})

describe("naming a note, against every case the Rust answers", () => {
  fixture.slugify.forEach(({ title, slug }) => {
    it(`slugify ${short(title)}`, () => {
      expect(slugify(title)).toBe(slug)
    })
  })

  fixture.uniqueSlug.forEach(({ candidate, taken, unique }) => {
    it(`uniqueSlug ${short(candidate)} among ${taken.length}`, () => {
      expect(uniqueSlug(candidate, taken)).toBe(unique)
    })
  })

  fixture.sortKey.forEach(({ title, key }) => {
    it(`sortKey ${short(title)}`, () => {
      expect(sortKey(title)).toBe(key)
    })
  })
})

describe("tags, against every case the Rust answers", () => {
  fixture.allTags.forEach(({ manual, body, tags }, at) => {
    it(`allTags ${at}: ${short(body)}`, () => {
      expect(allTags(manual, body)).toEqual(tags)
    })
  })

  fixture.normalizeTag.forEach(({ input, tag }) => {
    it(`normalizeTag ${short(input)}`, () => {
      expect(normalizeTag(input)).toBe(tag)
    })
  })

  fixture.normalizeManualTags.forEach(({ value, tags }, at) => {
    it(`normalizeManualTags ${at}: ${short(value)}`, () => {
      expect(normalizeManualTags(value)).toEqual(tags)
    })
  })
})

describe("where a note lives, against every case the Rust answers", () => {
  fixture.parseNoteId.forEach(({ id, location, roundTrip }) => {
    it(`parseNoteId ${short(id)}`, () => {
      const parsed = parseNoteId(id)

      expect(parsed).toEqual(location)
      // Back out again, because an id that parses and does not rebuild is a
      // note that moves when it is saved.
      expect(parsed === null ? null : toNoteId(parsed)).toBe(roundTrip)
    })
  })

  fixture.isValidFolderName.forEach(({ name, valid }) => {
    it(`isValidFolderName ${short(name)}`, () => {
      expect(isValidFolderName(name)).toBe(valid)
    })
  })

  fixture.restoreLocation.forEach(({ data, filename, location }, at) => {
    it(`restoreLocation ${at}: ${short(data)}`, () => {
      expect(restoreLocation(data, filename)).toEqual(location)
    })
  })

  fixture.trashLocation.forEach(({ filename, location }) => {
    it(`trashLocation ${short(filename)}`, () => {
      expect(trashLocation(filename)).toEqual(location)
    })
  })
})

describe("ordering, against every case the Rust answers", () => {
  /*
   * One case rather than many, and it is the whole list: sorting is only
   * meaningful end to end, and the interesting parts of it — accents, case,
   * numbers as text, an empty title — only show up as neighbours.
   */
  it("sorts every title the same way", () => {
    expect([...fixture.compareTitles.titles].sort(compareTitles)).toEqual(
      fixture.compareTitles.sorted
    )
  })

  it("sorts notes into the same order", () => {
    expect(sortNotes(fixture.sortNotes.notes).map((note) => note.id)).toEqual(
      fixture.sortNotes.order
    )
  })
})
