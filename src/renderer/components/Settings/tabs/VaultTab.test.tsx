import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { VaultTab } from "./VaultTab"
import { useNotesStore } from "../../../stores/notesStore"
import { emptyHistory } from "../../../stores/history"
import { stubBridge } from "../../../testing/bridge"

const info = {
  version: "1.0.0",
  electron: "42.0.0",
  chrome: "140.0.0",
  vaultPath: "/Users/writer/Documents/Tova",
  backupPath: "/Users/writer/Library/Application Support/tova/backups"
}

const backups = [
  { name: "2026-09-06T09-00-00", createdAt: Date.UTC(2026, 8, 6, 9), noteCount: 12 },
  { name: "2026-09-05T09-00-00", createdAt: Date.UTC(2026, 8, 5, 9), noteCount: 11 }
]

const vaults = [
  { path: "/Users/writer/Documents/Tova", name: "Tova", active: true },
  { path: "/Volumes/Ink/Second", name: "Second", active: false }
]

const listVaults = vi.fn()
const useVault = vi.fn()
const addVault = vi.fn()
const forgetVault = vi.fn()
const appInfo = vi.fn()
const reveal = vi.fn()
const listBackups = vi.fn()
const runBackup = vi.fn()
const restoreBackup = vi.fn()
const read = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  appInfo.mockResolvedValue(info)
  listVaults.mockResolvedValue(vaults)
  useVault.mockResolvedValue(vaults)
  addVault.mockResolvedValue(vaults)
  forgetVault.mockResolvedValue(vaults)
  listBackups.mockResolvedValue(backups)
  runBackup.mockResolvedValue(backups[0])
  restoreBackup.mockResolvedValue(backups[0])
  read.mockResolvedValue({
    id: "daily/2026-09-06.md",
    title: "9/6/26",
    section: "daily",
    folder: null,
    tags: [],
    updatedAt: 1,
    createdAt: 1,
    deletedAt: null,
    body: ""
  })

  window.tova = stubBridge({
    notes: { read },
    backups: { list: listBackups, run: runBackup, restore: restoreBackup },
    app: { info: appInfo, reveal },
    preferences: { listVaults, useVault, addVault, forgetVault }
  })

  useNotesStore.setState({
    view: "settings",
    activeId: "daily/2026-09-06.md",
    active: null,
    history: emptyHistory,
    error: null
  })
})

afterEach(cleanup)

describe("VaultTab", () => {
  it("shows where the vault and its backups live", async () => {
    render(<VaultTab />)
    expect(await screen.findByText(info.vaultPath)).toBeDefined()
    expect(screen.getByText(info.backupPath)).toBeDefined()
  })

  it("reveals a folder without being told a path", async () => {
    render(<VaultTab />)
    await screen.findByText(info.vaultPath)

    await userEvent.click(screen.getAllByRole("button", { name: "Open folder" })[0])
    expect(reveal).toHaveBeenCalledWith("vault")
  })

  it("lists snapshots with their note counts", async () => {
    render(<VaultTab />)
    expect(await screen.findAllByRole("button", { name: "Restore" })).toHaveLength(2)
    expect(screen.getByText("12 notes")).toBeDefined()
  })

  it("takes a snapshot on request and reloads the list", async () => {
    render(<VaultTab />)
    await screen.findByText(info.vaultPath)

    await userEvent.click(screen.getByRole("button", { name: "Back up now" }))
    expect(runBackup).toHaveBeenCalled()
    await waitFor(() => expect(listBackups).toHaveBeenCalledTimes(2))
  })

  it("asks before replacing the vault", async () => {
    render(<VaultTab />)
    const [first] = await screen.findAllByRole("button", { name: "Restore" })

    await userEvent.click(first)
    expect(screen.getByText("Replace the current vault?")).toBeDefined()
    expect(restoreBackup).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Replace" }))
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith(backups[0].name))
  })

  it("backs out of a restore without touching the vault", async () => {
    render(<VaultTab />)
    const [first] = await screen.findAllByRole("button", { name: "Restore" })

    await userEvent.click(first)
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(restoreBackup).not.toHaveBeenCalled()
    expect(await screen.findAllByRole("button", { name: "Restore" })).toHaveLength(2)
  })

  it("reports a failure instead of leaving the page blank", async () => {
    appInfo.mockRejectedValue(new Error("Vault unreachable"))
    render(<VaultTab />)
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Vault unreachable")
  })

  it("lists every vault and marks the one in use", async () => {
    render(<VaultTab />)

    expect(await screen.findByText("Second")).toBeDefined()
    const inUse = screen.getByRole("button", { name: "Tova, in use" })
    expect(inUse.getAttribute("aria-pressed")).toBe("true")
    // The one in use is a statement, not an offer.
    expect((inUse as HTMLButtonElement).disabled).toBe(true)
  })

  it("switches vault and reloads what was on screen", async () => {
    render(<VaultTab />)
    await screen.findByText("Second")

    await userEvent.click(screen.getByRole("button", { name: "Use Second" }))

    expect(useVault).toHaveBeenCalledWith("/Volumes/Ink/Second")
    // Everything showing belonged to the old vault.
    await waitFor(() => expect(appInfo).toHaveBeenCalledTimes(2))
  })

  it("refuses to forget the default vault", async () => {
    render(<VaultTab />)
    await screen.findByText("Second")

    expect((screen.getByLabelText("Forget Tova") as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText("Forget Second") as HTMLButtonElement).disabled).toBe(false)
  })

  it("forgets a vault without touching its folder", async () => {
    render(<VaultTab />)
    await screen.findByText("Second")

    await userEvent.click(screen.getByLabelText("Forget Second"))
    expect(forgetVault).toHaveBeenCalledWith("/Volumes/Ink/Second")
  })

  it("adds one through the picker", async () => {
    render(<VaultTab />)
    await screen.findByText("Second")

    await userEvent.click(screen.getByRole("button", { name: "Add a vault…" }))
    expect(addVault).toHaveBeenCalled()
  })
})

describe("VaultTab snapshot paging", () => {
  /** More snapshots than fit on a page, newest first. */
  const many = Array.from({ length: 15 }, (_, index) => ({
    name: `snap-${index}`,
    createdAt: Date.UTC(2026, 8, 20 - index, 9),
    noteCount: 30 - index
  }))

  beforeEach(() => {
    listBackups.mockResolvedValue(many)
  })

  it("shows one page and says where it is in the list", async () => {
    render(<VaultTab />)

    await waitFor(() => expect(screen.getByText("1–6 of 15")).toBeDefined())
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(6)
  })

  it("reaches the snapshots a plain cap used to hide", async () => {
    // The list was sliced to the first six, so everything older was
    // unreachable — and the list is the only route back to a snapshot.
    render(<VaultTab />)
    await waitFor(() => expect(screen.getByText("1–6 of 15")).toBeDefined())

    await userEvent.click(screen.getByRole("button", { name: "Older" }))
    expect(screen.getByText("7–12 of 15")).toBeDefined()

    await userEvent.click(screen.getByRole("button", { name: "Older" }))
    expect(screen.getByText("13–15 of 15")).toBeDefined()
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(3)
  })

  it("stops at each end rather than running off it", async () => {
    render(<VaultTab />)
    await waitFor(() => expect(screen.getByText("1–6 of 15")).toBeDefined())

    expect(screen.getByRole("button", { name: "Newer" })).toHaveProperty("disabled", true)

    await userEvent.click(screen.getByRole("button", { name: "Older" }))
    await userEvent.click(screen.getByRole("button", { name: "Older" }))
    expect(screen.getByRole("button", { name: "Older" })).toHaveProperty("disabled", true)
  })

  it("goes back to the newest page from the pager", async () => {
    render(<VaultTab />)
    await waitFor(() => expect(screen.getByText("1–6 of 15")).toBeDefined())

    await userEvent.click(screen.getByRole("button", { name: "Older" }))
    await userEvent.click(screen.getByRole("button", { name: "Newer" }))
    expect(screen.getByText("1–6 of 15")).toBeDefined()
  })

  it("shows no pager when everything fits on one page", async () => {
    listBackups.mockResolvedValue(many.slice(0, 4))
    render(<VaultTab />)

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(4))
    expect(screen.queryByRole("button", { name: "Older" })).toBeNull()
  })
})
