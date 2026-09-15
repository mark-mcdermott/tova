import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Welcome } from "./Welcome"

afterEach(cleanup)

function ask() {
  const onChoose = vi.fn()
  render(<Welcome onChoose={onChoose} />)
  return onChoose
}

describe("the first run's question", () => {
  it("offers three whole answers rather than a checklist", () => {
    ask()
    expect(screen.getAllByRole("button")).toHaveLength(3)
  })

  /*
   * The differences between the three are the point. If two of them turned the
   * same things on, one of them would be decoration.
   */
  it("gives each answer a different pair of settings", async () => {
    const onChoose = ask()
    const user = userEvent.setup()

    const seen: string[] = []
    for (const label of ["Everything", "Just writing", "Offline"]) {
      await user.click(screen.getByRole("button", { name: new RegExp(label) }))
      seen.push(JSON.stringify(onChoose.mock.calls.at(-1)?.[0]))
    }

    expect(new Set(seen).size).toBe(3)
  })

  it("fetches the dictionary only for the answer that asked for grammar", async () => {
    const onChoose = ask()
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: /Everything/ }))
    expect(onChoose).toHaveBeenLastCalledWith({ grammar: true, updates: true })

    await user.click(screen.getByRole("button", { name: /Just writing/ }))
    expect(onChoose).toHaveBeenLastCalledWith({ grammar: false, updates: true })
  })

  /** The offline answer has to mean it: neither of the two things that connect. */
  it("leaves the offline answer connecting to nothing", async () => {
    const onChoose = ask()
    await userEvent.setup().click(screen.getByRole("button", { name: /Offline/ }))
    expect(onChoose).toHaveBeenLastCalledWith({ grammar: false, updates: false })
  })

  /*
   * Harper catches roughly half of common mistakes and nothing that needs the
   * sentence parsed. Saying so where the choice is made is the difference
   * between a limitation and a nasty surprise, and it is easy to soften this
   * copy later without noticing what was lost.
   */
  it("says what grammar checking will and will not catch", () => {
    ask()
    const everything = screen.getByRole("button", { name: /Everything/ }).textContent ?? ""
    expect(everything).toMatch(/roughly half/)
    expect(everything).toMatch(/words rather than sentences/)
  })

  it("says what the download costs before anyone agrees to it", () => {
    ask()
    expect(screen.getByRole("button", { name: /Everything/ }).textContent).toMatch(/15MB/)
  })

  /* "No grammar checking" reads as "no checking at all", and it is not. */
  it("says spelling is checked whichever answer is given", () => {
    ask()
    expect(screen.getByText(/Spelling is checked either way/)).toBeTruthy()
  })

  it("puts focus in the dialog rather than behind it", () => {
    ask()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Everything/ }))
  })
})
