import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { useSuspendWindowDrag } from "./useWindowDrag"

function Popup() {
  useSuspendWindowDrag()
  return null
}

const suspended = () => document.body.classList.contains("is-popup-open")

afterEach(() => {
  cleanup()
  document.body.classList.remove("is-popup-open")
})

describe("suspending the window's drag strips", () => {
  it("suspends while a popup is open and restores after", () => {
    expect(suspended()).toBe(false)

    const { unmount } = render(<Popup />)
    expect(suspended()).toBe(true)

    unmount()
    expect(suspended()).toBe(false)
  })

  it("keeps the strips suspended while a nested popup outlives its opener", () => {
    // A confirm opens from a menu, and the menu closes first. Without counting,
    // the menu's cleanup would hand the header back to the window manager and
    // the dialog's backdrop would stop taking clicks.
    const menu = render(<Popup />)
    const dialog = render(<Popup />)

    menu.unmount()
    expect(suspended()).toBe(true)

    dialog.unmount()
    expect(suspended()).toBe(false)
  })
})
