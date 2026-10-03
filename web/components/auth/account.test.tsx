import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AccountForm } from "./AccountForm"
import type { OpenVault, VaultClient } from "../../../src/shared/vaultClient"

const EMAIL = "mark@markmcdermott.io"
const PASSWORD = "a long enough password"
const KEY = "K7M2-PQ9X-4RTV-HJ3N-WY6Z-B8DF"
const VAULT: OpenVault = { contentKey: new Uint8Array(32) as Uint8Array<ArrayBuffer>, epoch: 1 }

const refuse = (what: string) => () => Promise.reject(new Error(`${what} should not be called`))

function fakeClient(over: Partial<VaultClient> = {}): VaultClient {
  return {
    signUp: refuse("signUp"),
    signIn: async () => ({ state: "unlocked", ...VAULT }),
    mintVault: refuse("mintVault"),
    unlockWithOldPassword: refuse("unlockWithOldPassword"),
    recoverAfterReset: refuse("recoverAfterReset"),
    changePassword: refuse("changePassword"),
    reWrapPassword: refuse("reWrapPassword"),
    rotateRecoveryKey: refuse("rotateRecoveryKey"),
    ...over
  } as VaultClient
}

const fill = async (label: string, value: string) => {
  await userEvent.type(screen.getByLabelText(label), value)
}

const unlocked = async (over: Partial<VaultClient> = {}, drop = vi.fn(async () => undefined)) => {
  render(<AccountForm email={EMAIL} client={fakeClient(over)} drop={drop} />)
  await fill("Password", PASSWORD)
  await userEvent.click(screen.getByRole("button", { name: "Continue" }))
  await screen.findByText("Change your password")
  return drop
}

describe("getting into the account screen", () => {
  it("shows nothing to act on until the password opens the vault", async () => {
    render(<AccountForm email={EMAIL} client={fakeClient()} />)

    expect(screen.queryByText("Change your password")).toBeNull()
    expect(screen.queryByRole("button", { name: "Make a new recovery key" })).toBeNull()
  })

  /*
   * Signed in is not the same as unlocked. A password that authenticates but
   * does not unwrap the envelope leaves the content key out of reach, and both
   * operations on this screen need it.
   */
  it("refuses a password that signs in without opening the vault", async () => {
    render(
      <AccountForm
        email={EMAIL}
        client={fakeClient({ signIn: async () => ({ state: "locked" }) })}
      />
    )

    await fill("Password", PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: "Continue" }))

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That password does not open this vault."
    )
    expect(screen.queryByText("Change your password")).toBeNull()
  })

  /*
   * Forgetting is reachable before unlocking. Somebody who wants the key off
   * this browser should not have to remember the password to achieve it.
   */
  it("forgets this device without needing the vault open", async () => {
    const drop = vi.fn(async () => undefined)
    render(<AccountForm email={EMAIL} client={fakeClient()} drop={drop} />)

    await userEvent.click(screen.getByRole("button", { name: "Forget this device" }))

    expect(drop).toHaveBeenCalled()
  })
})

describe("changing a password from the account screen", () => {
  it("passes the password that opened the vault as the current one", async () => {
    const changePassword = vi.fn(async () => undefined)
    await unlocked({ changePassword })

    await fill("New password", "something else entirely")
    await fill("New password again", "something else entirely")
    await userEvent.click(screen.getByRole("button", { name: "Change password" }))

    expect(changePassword).toHaveBeenCalledWith(EMAIL, PASSWORD, "something else entirely", VAULT)
    expect(await screen.findByText(/Your password is changed/)).toBeTruthy()
  })

  it("will not submit a short password or a pair that differs", async () => {
    const changePassword = vi.fn()
    await unlocked({ changePassword })

    await fill("New password", "short")
    expect(screen.getByText("At least 12 characters.")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Change password" }))
    expect(changePassword).not.toHaveBeenCalled()
  })

  /*
   * Reached from a dispatched submit, because the disabled button blocks both a
   * click and Enter and nothing downstream re-checks a password's length. Same
   * reasoning as the signup form, and the same tamper passed without it.
   */
  it("refuses a short password even when the button is bypassed", async () => {
    const changePassword = vi.fn()
    await unlocked({ changePassword })

    await fill("New password", "short")
    await fill("New password again", "short")
    const form = screen.getByText("Change your password").closest("form")
    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    expect(changePassword).not.toHaveBeenCalled()
  })

  /*
   * The second change in one visit is the one that catches a stale password.
   * The envelope is sealed under the new one now, so sending the old one as
   * `current` would be refused — by Better Auth, after the screen had already
   * said it worked.
   */
  it("uses the new password as current for a second change", async () => {
    const changePassword = vi.fn(async () => undefined)
    await unlocked({ changePassword })

    await fill("New password", "something else entirely")
    await fill("New password again", "something else entirely")
    await userEvent.click(screen.getByRole("button", { name: "Change password" }))
    await screen.findByText(/Your password is changed/)

    await fill("New password", "a third password for it")
    await fill("New password again", "a third password for it")
    await userEvent.click(screen.getByRole("button", { name: "Change password" }))

    expect(changePassword).toHaveBeenLastCalledWith(
      EMAIL,
      "something else entirely",
      "a third password for it",
      VAULT
    )
  })
})

describe("replacing a recovery key from the account screen", () => {
  it("shows the new one once, and only after the vault is open", async () => {
    const rotateRecoveryKey = vi.fn(async () => KEY)
    await unlocked({ rotateRecoveryKey })

    await userEvent.click(screen.getByRole("button", { name: "Make a new recovery key" }))

    expect(await screen.findByTestId("recovery-key")).toHaveProperty("textContent", KEY)
    expect(rotateRecoveryKey).toHaveBeenCalledWith(VAULT)
  })

  it("will not move on until the new key is acknowledged", async () => {
    await unlocked({ rotateRecoveryKey: async () => KEY })

    await userEvent.click(screen.getByRole("button", { name: "Make a new recovery key" }))
    const done = await screen.findByRole("button", { name: "Done" })

    expect(done).toHaveProperty("disabled", true)
    await userEvent.click(screen.getByRole("checkbox"))
    await userEvent.click(done)

    expect(await screen.findByText("Change your password")).toBeTruthy()
  })

  it("says what the server refused rather than claiming a new key", async () => {
    await unlocked({
      rotateRecoveryKey: async () => {
        throw new Error("Could not store the new recovery key")
      }
    })

    await userEvent.click(screen.getByRole("button", { name: "Make a new recovery key" }))

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not store the new recovery key"
    )
    expect(screen.queryByTestId("recovery-key")).toBeNull()
  })
})
