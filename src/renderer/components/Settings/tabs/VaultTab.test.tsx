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

const appInfo = vi.fn()
const reveal = vi.fn()
const listBackups = vi.fn()
const runBackup = vi.fn()
const restoreBackup = vi.fn()
const read = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  appInfo.mockResolvedValue(info)
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
    deletedAt: null,
    body: ""
  })

  window.tova = stubBridge({
    notes: { read },
    backups: { list: listBackups, run: runBackup, restore: restoreBackup },
    app: { info: appInfo, reveal }
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
})
