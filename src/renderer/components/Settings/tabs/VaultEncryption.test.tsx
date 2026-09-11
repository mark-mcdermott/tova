import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { VaultTab } from "./VaultTab"
import { stubBridge } from "../../../testing/bridge"
import { VaultChoice } from "../../../../shared/types"

const listVaults = vi.fn()
const encryptVault = vi.fn()
const decryptVault = vi.fn()
const unlockVault = vi.fn()

const RECOVERY = "K7M4-Q2XP-7HND-9RTV-3BWC-5FKJ"

function vault(overrides: Partial<VaultChoice> = {}): VaultChoice {
  return {
    path: "/Users/someone/Documents/Tova",
    name: "Tova",
    active: true,
    encrypted: false,
    locked: false,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  encryptVault.mockResolvedValue(RECOVERY)
  decryptVault.mockResolvedValue([vault()])
  unlockVault.mockResolvedValue(true)
  listVaults.mockResolvedValue([vault()])
  window.tova = stubBridge({
    preferences: { listVaults, encryptVault, decryptVault, unlockVault }
  })
})

afterEach(cleanup)

describe("encrypting a vault", () => {
  it("asks first, naming the folder it is about to seal", async () => {
    render(<VaultTab />)
    await userEvent.click(await screen.findByRole("button", { name: "Encrypt Tova" }))

    // In the dialog, not merely somewhere on the page — the row behind it
    // names the same folder.
    const asked = within(screen.getByRole("alertdialog"))
    expect(asked.getByText("/Users/someone/Documents/Tova")).toBeDefined()
    expect(encryptVault).not.toHaveBeenCalled()
  })

  it("shows the recovery key once, and says it cannot be shown again", async () => {
    render(<VaultTab />)
    await userEvent.click(await screen.findByRole("button", { name: "Encrypt Tova" }))
    await userEvent.click(screen.getByRole("button", { name: "Encrypt" }))

    await waitFor(() => expect(screen.getByText(RECOVERY)).toBeDefined())
    expect(screen.getByText(/cannot show it to you again/)).toBeDefined()
  })

  it("does nothing at all when the question is waved off", async () => {
    render(<VaultTab />)
    await userEvent.click(await screen.findByRole("button", { name: "Encrypt Tova" }))
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(encryptVault).not.toHaveBeenCalled()
  })
})

describe("a vault that is already sealed", () => {
  beforeEach(() => {
    listVaults.mockResolvedValue([vault({ encrypted: true })])
  })

  it("says so, and offers the way back rather than the way in", async () => {
    render(<VaultTab />)

    expect(await screen.findByText("Encrypted")).toBeDefined()
    expect(screen.getByRole("button", { name: "Decrypt Tova" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Encrypt Tova" })).toBeNull()
  })

  it("asks before putting the notes back in plain sight", async () => {
    render(<VaultTab />)
    await userEvent.click(await screen.findByRole("button", { name: "Decrypt Tova" }))
    expect(decryptVault).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Decrypt" }))
    await waitFor(() => expect(decryptVault).toHaveBeenCalledWith("/Users/someone/Documents/Tova"))
  })
})

describe("a vault this machine has no key for", () => {
  beforeEach(() => {
    listVaults.mockResolvedValue([vault({ encrypted: true, locked: true })])
  })

  it("says it is locked and asks for the recovery key", async () => {
    render(<VaultTab />)

    expect(await screen.findByText("Locked")).toBeDefined()
    await userEvent.click(screen.getByRole("button", { name: "Unlock Tova" }))
    expect(screen.getByLabelText("Recovery key")).toBeDefined()
  })

  it("will not send an empty one", async () => {
    render(<VaultTab />)
    await userEvent.click(await screen.findByRole("button", { name: "Unlock Tova" }))

    expect(screen.getByRole("button", { name: "Unlock" })).toHaveProperty("disabled", true)
  })

  it("says so when the key does not open it, rather than failing quietly", async () => {
    unlockVault.mockResolvedValue(false)
    render(<VaultTab />)
    await userEvent.click(await screen.findByRole("button", { name: "Unlock Tova" }))
    await userEvent.type(screen.getByLabelText("Recovery key"), "WRON-GKEY-WRON-GKEY-WRON-GKEY")
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }))

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That key does not open this vault."
    )
  })

  it("opens it when the key is right", async () => {
    render(<VaultTab />)
    await userEvent.click(await screen.findByRole("button", { name: "Unlock Tova" }))
    await userEvent.type(screen.getByLabelText("Recovery key"), RECOVERY)
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }))

    await waitFor(() =>
      expect(unlockVault).toHaveBeenCalledWith("/Users/someone/Documents/Tova", RECOVERY)
    )
    await waitFor(() => expect(screen.queryByLabelText("Recovery key")).toBeNull())
  })
})
