// Reads the source tree, so it says so — the renderer's tsconfig does not
// expect Node.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { Icon } from "./icons"

/*
 * Marks are drawn, not typed.
 *
 * A glyph in a string renders only if the interface font happens to carry it.
 * `⤺` did not, and the restore control arrived as whatever the fallback had —
 * a small angular mark that read as nothing at all. `✕` is the same gamble
 * with better odds: it is a dingbat, not Latin-1 like `×`, so it survives on
 * the machines that have it and quietly degrades on the ones that do not.
 *
 * The icon set already carries `close`. There is no reason to type one.
 */
function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(path)
    }
  }
  return found
}

describe("the icon set", () => {
  it("draws a close mark, so nothing has to type one", () => {
    render(<Icon name="close" className="probe" />)
    const svg = document.querySelector(".probe")

    expect(svg?.querySelector("path")).not.toBeNull()
    // Hidden from the tree: every button wearing one carries its own label,
    // and an icon announcing itself as well would say the name twice.
    expect(svg?.getAttribute("aria-hidden")).toBe("true")
    cleanup()
  })

  it("renders the mark inside a labelled button without stealing its name", () => {
    render(
      <button type="button" aria-label="Dismiss">
        <Icon name="close" />
      </button>
    )

    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined()
    cleanup()
  })

  /*
   * The guard, rather than the fix. Both of these were found by reading, which
   * is exactly how the first one got missed for as long as it did.
   */
  it("is the only place a close mark is written", () => {
    const typed = sourceFiles("src/renderer")
      .filter((file) => readFileSync(file, "utf-8").includes("✕"))
      .map((file) => file.replace("src/renderer/", ""))

    expect(typed).toEqual([])
  })
})
