import { describe, it, expect, vi, afterEach } from "vitest"
import { useState } from "react"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Stepper } from "./Stepper"

afterEach(cleanup)

const limits = { min: 12, max: 24 }

/**
 * Stateful on purpose. Preferences feed the committed value back as a prop, and
 * a static prop would hide the very thing being tested — whether what you typed
 * survives the round trip.
 */
function setup(initial = 18) {
  const onChange = vi.fn()

  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <Stepper
        id="size"
        value={value}
        limits={limits}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
      />
    )
  }

  render(<Harness />)
  return { field: screen.getByRole("spinbutton") as HTMLInputElement, onChange }
}

describe("typing into a bounded field", () => {
  it("lets a number be typed through a digit that is below the minimum", async () => {
    // The bug: 18, select all, type "2" — the store clamped 2 to 12 and put it
    // back in the field, so the "0" of "20" never had anywhere to land.
    const { field, onChange } = setup()
    await userEvent.clear(field)
    await userEvent.type(field, "20")

    expect(field.value).toBe("20")
    expect(onChange).toHaveBeenLastCalledWith(20)
  })

  it("shows what was typed rather than a number the reader did not type", async () => {
    const { field, onChange } = setup()
    await userEvent.clear(field)
    await userEvent.type(field, "2")

    expect(field.value).toBe("2")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("commits as you type once the value is inside the bounds", async () => {
    // Which is what keeps the spinner arrows immediate.
    const { field, onChange } = setup()
    fireEvent.change(field, { target: { value: "19" } })

    expect(onChange).toHaveBeenCalledWith(19)
  })

  it("clamps a too-large number when the field is left, not while typing", async () => {
    const { field, onChange } = setup()
    await userEvent.clear(field)
    await userEvent.type(field, "200")

    // "20" is a legitimate value and commits on the way past; "200" is not, so
    // it is held as text rather than snapping the field to 24 mid-word.
    expect(onChange).toHaveBeenLastCalledWith(20)
    expect(field.value).toBe("200")

    fireEvent.blur(field)
    expect(onChange).toHaveBeenLastCalledWith(limits.max)
  })

  it("clamps a too-small number when the field is left", async () => {
    const { field, onChange } = setup()
    await userEvent.clear(field)
    await userEvent.type(field, "3")

    fireEvent.blur(field)
    expect(onChange).toHaveBeenCalledWith(limits.min)
  })

  it("goes back to the old value when the field is left empty", async () => {
    const { field, onChange } = setup()
    await userEvent.clear(field)
    fireEvent.blur(field)

    expect(onChange).not.toHaveBeenCalled()
    expect(field.value).toBe("18")
  })

  it("commits on Enter without waiting for a click elsewhere", async () => {
    const { field, onChange } = setup()
    await userEvent.clear(field)
    await userEvent.type(field, "3{Enter}")

    expect(onChange).toHaveBeenCalledWith(limits.min)
  })
})
