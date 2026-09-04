import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Menu } from "./Menu"

afterEach(cleanup)

describe("Menu", () => {
  it("renders its actions", () => {
    render(<Menu x={10} y={10} items={[{ label: "Rename", onSelect: vi.fn() }]} onClose={vi.fn()} />)
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeDefined()
  })

  /*
   * The glass panels use backdrop-filter, which makes them the containing block
   * for position:fixed descendants. A menu rendered inside one is positioned
   * against the panel rather than the viewport, and focusing it scrolls the
   * panel's overflow:hidden box sideways. Portalling to body avoids all of it.
   */
  it("escapes its parent so no glass ancestor can capture it", () => {
    const { container } = render(
      <div className="editor-shell">
        <Menu x={10} y={10} items={[{ label: "Rename", onSelect: vi.fn() }]} onClose={vi.fn()} />
      </div>
    )

    expect(container.querySelector(".popup-menu")).toBeNull()
    expect(document.body.querySelector(".popup-menu")).not.toBeNull()
  })

  it("renders a separator between groups", () => {
    const { baseElement } = render(
      <Menu
        x={10}
        y={10}
        items={[{ label: "Rename", onSelect: vi.fn() }, "separator", { label: "Delete", onSelect: vi.fn() }]}
        onClose={vi.fn()}
      />
    )
    expect(baseElement.querySelector(".popup-menu-separator")).not.toBeNull()
  })

  it("closes after an action runs", async () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()
    render(<Menu x={10} y={10} items={[{ label: "Rename", onSelect }]} onClose={onClose} />)

    await userEvent.setup().click(screen.getByRole("menuitem", { name: "Rename" }))
    expect(onSelect).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("stays open for an item that swaps in more choices", async () => {
    const onClose = vi.fn()
    render(
      <Menu
        x={10}
        y={10}
        items={[{ label: "Move to…", keepOpen: true, onSelect: vi.fn() }]}
        onClose={onClose}
      />
    )

    await userEvent.setup().click(screen.getByRole("menuitem", { name: "Move to…" }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes on Escape", async () => {
    const onClose = vi.fn()
    render(<Menu x={10} y={10} items={[{ label: "Rename", onSelect: vi.fn() }]} onClose={onClose} />)

    await userEvent.setup().keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })

  it("closes on a click outside", async () => {
    const onClose = vi.fn()
    render(<Menu x={10} y={10} items={[{ label: "Rename", onSelect: vi.fn() }]} onClose={onClose} />)

    await userEvent.setup().click(document.body)
    expect(onClose).toHaveBeenCalled()
  })
})
