import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { normalizeScreen } from "../shared/screen"

/*
 * The other half of the Rust test in src-tauri/src/screen.rs. This one keeps
 * the fixture honest: if the TypeScript changes and the fixture is not
 * regenerated, this fails first and says so — before the Rust side is blamed
 * for a difference it did not introduce.
 */
describe("the screen conformance fixture", () => {
  const doc = JSON.parse(readFileSync("conformance/screen.json", "utf-8"))

  it("says what this backend actually does", () => {
    expect(doc.cases).toHaveLength(doc.expected.length)

    doc.cases.forEach((value: unknown, at: number) => {
      expect(normalizeScreen(value) ?? null, `case ${at}: ${JSON.stringify(value)}`).toEqual(
        doc.expected[at]
      )
    })
  })
})
