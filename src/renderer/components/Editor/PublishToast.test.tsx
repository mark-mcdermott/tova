import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PublishToasts } from "./PublishToast"
import { usePublishStore } from "../../stores/publishStore"
import { stubBridge } from "../../testing/bridge"
import { PublishUpdate } from "../../../shared/types"

const openExternal = vi.fn()

function update(overrides: Partial<PublishUpdate> = {}): PublishUpdate {
  return {
    id: "job-1",
    request: { noteId: "notes/a.md", blog: "a.com", headerLine: 0 },
    phase: "building",
    progress: 40,
    message: "Building…",
    filename: "26-05-17-a.md",
    url: null,
    error: null,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = stubBridge({ app: { openExternal } })
  usePublishStore.setState({ jobs: [] })
})

afterEach(cleanup)

describe("PublishToasts", () => {
  it("shows nothing while nothing is publishing", () => {
    const { container } = render(<PublishToasts />)
    expect(container.textContent).toBe("")
  })

  it("reports progress while a build runs", () => {
    render(<PublishToasts />)
    act(() => usePublishStore.getState().apply(update()))

    expect(screen.getByText("Publishing…")).toBeDefined()
    expect(screen.getByText("Building…")).toBeDefined()
  })

  it("offers the post once it is live", async () => {
    render(<PublishToasts />)
    act(() =>
      usePublishStore.getState().apply(
        update({
          phase: "published",
          progress: 100,
          message: "Published",
          url: "https://a.com/x"
        })
      )
    )

    expect(screen.getByText("Published!")).toBeDefined()
    await userEvent.click(screen.getByRole("button", { name: "View post" }))
    expect(openExternal).toHaveBeenCalledWith("https://a.com/x")
  })

  it("shows the reason a publish failed", () => {
    render(<PublishToasts />)
    act(() =>
      usePublishStore.getState().apply(update({ phase: "failed", error: "Bad credentials" }))
    )

    expect(screen.getByText("Publish failed")).toBeDefined()
    expect(screen.getByText("Bad credentials")).toBeDefined()
  })

  it("replaces an attempt's own updates rather than stacking them", () => {
    render(<PublishToasts />)
    act(() => usePublishStore.getState().apply(update({ message: "Pushing…" })))
    act(() => usePublishStore.getState().apply(update({ message: "Building…" })))

    expect(usePublishStore.getState().jobs).toHaveLength(1)
    expect(screen.queryByText("Pushing…")).toBeNull()
  })

  it("keeps a second publish separate from the first", () => {
    render(<PublishToasts />)
    act(() => usePublishStore.getState().apply(update()))
    act(() => usePublishStore.getState().apply(update({ id: "job-2" })))

    expect(screen.getAllByRole("status")).toHaveLength(2)
  })

  it("can be dismissed", async () => {
    render(<PublishToasts />)
    act(() => usePublishStore.getState().apply(update()))

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(usePublishStore.getState().jobs).toHaveLength(0)
  })
})
