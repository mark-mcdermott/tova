import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { parseFrontMatter, serializeFrontMatter, FrontMatterValue } from "../shared/frontMatter"
import { slugify, uniqueSlug } from "../shared/noteName"
import { allTags, normalizeManualTags, normalizeTag } from "../shared/tags"
import {
  isValidFolderName,
  NoteLocation,
  parseNoteId,
  restoreLocation,
  toNoteId,
  trashLocation
} from "../shared/noteLocation"

/*
 * The other half of src-tauri/src/conformance.rs. This one keeps the fixture
 * honest: if the TypeScript changes and the fixture is not regenerated, this
 * fails first and says so, before the Rust is blamed for a difference it did
 * not introduce.
 */
type Data = Record<string, FrontMatterValue>

interface Fixture {
  parse: { raw: string; data: Data; body: string }[]
  serialize: { data: Data; order: string[]; body: string; text: string }[]
  slugify: { title: string; slug: string }[]
  uniqueSlug: { candidate: string; taken: string[]; unique: string }[]
  allTags: { manual: string[]; body: string; tags: string[] }[]
  normalizeTag: { input: string; tag: string | null }[]
  normalizeManualTags: { value: unknown; tags: string[] }[]
  parseNoteId: { id: string; location: NoteLocation | null; roundTrip: string | null }[]
  isValidFolderName: { name: string; valid: boolean }[]
  restoreLocation: { data: Data; filename: string; location: NoteLocation }[]
  trashLocation: { filename: string; location: NoteLocation }[]
}

const doc: Fixture = JSON.parse(readFileSync("conformance/text.json", "utf-8"))

describe("the text conformance fixture", () => {
  it("says how this backend splits a note", () => {
    for (const one of doc.parse) {
      const { data, body } = parseFrontMatter(one.raw)

      expect(data, JSON.stringify(one.raw)).toEqual(one.data)
      expect(body, JSON.stringify(one.raw)).toBe(one.body)
    }
  })

  it("says how this backend writes one, in the order it writes the keys", () => {
    for (const one of doc.serialize) {
      // Rebuilt from `order` rather than taken as parsed, for the same reason
      // the Rust does: the order is the expected answer, not the file's.
      const data: Data = {}
      for (const key of one.order) data[key] = one.data[key]

      expect(Object.keys(data)).toEqual(one.order)
      expect(serializeFrontMatter(data, one.body), JSON.stringify(one.data)).toBe(one.text)
    }
  })

  it("says what a title slugs to", () => {
    for (const one of doc.slugify) {
      expect(slugify(one.title), JSON.stringify(one.title)).toBe(one.slug)
    }
  })

  it("says which free name it picks", () => {
    for (const one of doc.uniqueSlug) {
      expect(uniqueSlug(one.candidate, one.taken)).toBe(one.unique)
    }
  })

  it("says which tags a note carries", () => {
    for (const one of doc.allTags) {
      expect(allTags(one.manual, one.body), JSON.stringify(one.body)).toEqual(one.tags)
    }
  })

  it("says what a written tag means", () => {
    for (const one of doc.normalizeTag) {
      expect(normalizeTag(one.input), JSON.stringify(one.input)).toBe(one.tag)
    }
  })

  it("says what front matter tags mean", () => {
    for (const one of doc.normalizeManualTags) {
      expect(normalizeManualTags(one.value), JSON.stringify(one.value)).toEqual(one.tags)
    }
  })

  it("says which strings are note ids", () => {
    for (const one of doc.parseNoteId) {
      const location = parseNoteId(one.id)

      expect(location, JSON.stringify(one.id)).toEqual(one.location)
      if (location !== null) expect(toNoteId(location)).toBe(one.roundTrip)
    }
  })

  it("says which strings are folder names", () => {
    for (const one of doc.isValidFolderName) {
      expect(isValidFolderName(one.name), JSON.stringify(one.name)).toBe(one.valid)
    }
  })

  it("says where a trashed note came from", () => {
    for (const one of doc.restoreLocation) {
      expect(restoreLocation(one.data, one.filename), JSON.stringify(one.data)).toEqual(
        one.location
      )
    }
  })

  it("says where a deleted note goes", () => {
    for (const one of doc.trashLocation) {
      expect(trashLocation(one.filename)).toEqual(one.location)
    }
  })
})
