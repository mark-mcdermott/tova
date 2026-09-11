import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmDialog } from "./ConfirmDialog"

afterEach(cleanup)

function open(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  render(
    <ConfirmDialog
      title="Move it to Trash?"
      body="It can be restored from there."
      confirmLabel="Move to Trash"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  )
  return { onConfirm, onCancel }
}

describe("ConfirmDialog", () => {
  it("asks the question and offers both answers", () => {
    open()
    expect(screen.getByRole("alertdialog", { name: "Move it to Trash?" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Move to Trash" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined()
  })

  it("starts on Cancel, not on the destructive answer", async () => {
    open()
    // Every use of this is destructive, so a stray Return should do nothing.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }))
  })

  it("confirms when the confirm button is chosen", async () => {
    const { onConfirm, onCancel } = open()
    await userEvent.click(screen.getByRole("button", { name: "Move to Trash" }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("cancels on Escape", async () => {
    const { onConfirm, onCancel } = open()
    await userEvent.keyboard("{Escape}")

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("cancels when the backdrop is clicked, but not the panel", async () => {
    const { onCancel } = open()
    const panel = screen.getByRole("alertdialog")

    await userEvent.click(panel)
    expect(onCancel).not.toHaveBeenCalled()

    await userEvent.click(panel.parentElement as HTMLElement)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("keeps Tab inside the dialog", async () => {
    open()
    const cancel = screen.getByRole("button", { name: "Cancel" })
    const confirm = screen.getByRole("button", { name: "Move to Trash" })

    await userEvent.tab()
    expect(document.activeElement).toBe(confirm)

    // Past the last control, back to the first — never out to the page behind.
    await userEvent.tab()
    expect(document.activeElement).toBe(cancel)
  })
})

describe("a confirm that asks for a word", () => {
  const props = {
    title: "Delete everything?",
    body: "This cannot be undone.",
    confirmLabel: "Delete everything",
    confirmWord: "confirm",
    destructive: true
  }

  it("will not fire until the word is typed exactly", async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={vi.fn()} />)
    const confirm = screen.getByRole("button", { name: "Delete everything" })

    expect(confirm).toHaveProperty("disabled", true)
    await userEvent.type(screen.getByLabelText("Type confirm to confirm"), "confir")
    expect(confirm).toHaveProperty("disabled", true)

    await userEvent.type(screen.getByLabelText("Type confirm to confirm"), "m")
    expect(confirm).toHaveProperty("disabled", false)
    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalled()
  })

  it("names what it is about to take, rather than gesturing at it", () => {
    render(
      <ConfirmDialog
        {...props}
        details={["/Users/someone/Documents/Tova", "/Users/someone/Library/tova"]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText("/Users/someone/Documents/Tova")).toBeDefined()
    expect(screen.getByText("/Users/someone/Library/tova")).toBeDefined()
  })

  it("still fires straight away where no word is asked for", async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        title="Move to trash?"
        body="It can be restored."
        confirmLabel="Move to trash"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Move to trash" }))
    expect(onConfirm).toHaveBeenCalled()
  })
})
