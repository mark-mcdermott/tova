import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SignUpForm } from "./SignUpForm"
import { SignInForm } from "./SignInForm"
import { StartFreshForm } from "./StartFreshForm"
import type { OpenVault, SignedIn, VaultClient } from "../../../src/shared/vaultClient"

const KEY = "K7M2-PQ9X-4RTV-HJ3N-WY6Z-B8DF"
const VAULT: OpenVault = { contentKey: new Uint8Array(32) as Uint8Array<ArrayBuffer>, epoch: 1 }

const refuse = (what: string) => () => Promise.reject(new Error(`${what} should not be called`))

/** Every method refusing, so a test only has to say what it expects to happen. */
function fakeClient(over: Partial<VaultClient> = {}): VaultClient {
  return {
    signUp: refuse("signUp"),
    signIn: refuse("signIn"),
    mintVault: refuse("mintVault"),
    unlockWithOldPassword: refuse("unlockWithOldPassword"),
    recoverAfterReset: refuse("recoverAfterReset"),
    changePassword: refuse("changePassword"),
    reWrapPassword: refuse("reWrapPassword"),
    rotateRecoveryKey: refuse("rotateRecoveryKey"),
    ...over
  } as VaultClient
}

const fill = async (label: RegExp | string, value: string) => {
  await userEvent.type(screen.getByLabelText(label), value)
}

describe("signing up", () => {
  it("will not submit a password shorter than the floor, and says why", async () => {
    const signUp = vi.fn()
    render(<SignUpForm client={fakeClient({ signUp })} />)

    await fill("Name", "Mark")
    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "short")

    expect(screen.getByText("At least 12 characters.")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))
    expect(signUp).not.toHaveBeenCalled()
  })

  it("will not submit when the two passwords differ", async () => {
    const signUp = vi.fn()
    render(<SignUpForm client={fakeClient({ signUp })} />)

    await fill("Name", "Mark")
    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "a long enough password")
    await fill("Password again", "a different long one")

    expect(screen.getByText("These two do not match.")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))
    expect(signUp).not.toHaveBeenCalled()
  })

  /*
   * The disabled button blocks a click and blocks Enter, so the check inside
   * the submit handler cannot be reached by either — which is exactly why it is
   * tested from a dispatched submit event instead. Nothing downstream re-checks
   * the length: Better Auth only ever sees a scrypt output, and its own minimum
   * is about that, not about what anybody typed. Removing the handler's check
   * passed every other test here.
   */
  it("refuses a short password even when the button is bypassed", async () => {
    const signUp = vi.fn()
    const { container } = render(<SignUpForm client={fakeClient({ signUp })} />)

    await fill("Name", "Mark")
    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "short")

    const form = container.querySelector("form")
    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    expect(signUp).not.toHaveBeenCalled()
  })

  it("shows the recovery key once the account is made", async () => {
    const signUp = vi.fn(async () => ({ ...VAULT, recoveryKey: KEY }))
    render(<SignUpForm client={fakeClient({ signUp })} />)

    await fill("Name", "Mark")
    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "a long enough password")
    await fill("Password again", "a long enough password")
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByTestId("recovery-key")).toHaveProperty("textContent", KEY)
    expect(signUp).toHaveBeenCalledWith("mark@markmcdermott.io", "a long enough password", "Mark")
  })

  /*
   * The acknowledgement has to genuinely block. Somebody who can click past it
   * has an account whose recovery key they never saved, which is the exact trap
   * the "no recovery key" screen exists to tell them nothing can be done about.
   */
  it("will not move on until the recovery key is acknowledged", async () => {
    render(
      <SignUpForm client={fakeClient({ signUp: async () => ({ ...VAULT, recoveryKey: KEY }) })} />
    )

    await fill("Name", "Mark")
    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "a long enough password")
    await fill("Password again", "a long enough password")
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))

    const finish = await screen.findByRole("button", { name: "Finish" })
    expect(finish).toHaveProperty("disabled", true)

    await userEvent.click(screen.getByRole("checkbox"))
    expect(finish).toHaveProperty("disabled", false)

    // And unticking puts it back, so the box reports what it says it reports.
    await userEvent.click(screen.getByRole("checkbox"))
    expect(finish).toHaveProperty("disabled", true)

    await userEvent.click(screen.getByRole("checkbox"))
    await userEvent.click(finish)
    expect(screen.getByText("Your vault is ready")).toBeTruthy()
  })

  it("puts a refusal from the server where the reader is looking", async () => {
    render(
      <SignUpForm
        client={fakeClient({
          signUp: async () => {
            throw new Error("That account already exists")
          }
        })}
      />
    )

    await fill("Name", "Mark")
    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "a long enough password")
    await fill("Password again", "a long enough password")
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That account already exists"
    )
  })
})

const signedIn = (state: SignedIn) => fakeClient({ signIn: async () => state })

const signIntoForm = async (client: VaultClient) => {
  render(<SignInForm client={client} />)
  await fill("Email", "mark@markmcdermott.io")
  await fill("Password", "a long enough password")
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }))
}

describe("signing in", () => {
  it("opens the vault when the password unwraps it", async () => {
    await signIntoForm(signedIn({ state: "unlocked", ...VAULT }))

    expect(await screen.findByText("You are in")).toBeTruthy()
  })

  /*
   * The state that reads as a bug and is not: the password was right and the
   * notes did not open. The copy has to say so, because "signed in and still
   * locked" is otherwise indistinguishable from something broken.
   */
  it("explains a locked vault rather than reporting an error", async () => {
    await signIntoForm(signedIn({ state: "locked" }))

    expect(await screen.findByText("Your notes are still locked")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("unlocks a locked vault with the recovery key", async () => {
    const recoverAfterReset = vi.fn(async () => VAULT)
    await signIntoForm(fakeClient({ signIn: async () => ({ state: "locked" }), recoverAfterReset }))

    await fill("Recovery key", KEY)
    await userEvent.click(screen.getByRole("button", { name: "Unlock with my recovery key" }))

    expect(await screen.findByText("You are in")).toBeTruthy()
    expect(recoverAfterReset).toHaveBeenCalledWith(
      "mark@markmcdermott.io",
      "a long enough password",
      KEY
    )
  })

  /*
   * Finishing an interrupted password change moves the envelope and nothing
   * else — the credential is already the one that just signed in. Going back
   * through `changePassword` would ask Better Auth to replace a password with
   * itself, so this asserts the quieter call is the one made.
   */
  it("finishes an interrupted password change with the previous password", async () => {
    const unlockWithOldPassword = vi.fn(async () => VAULT)
    const reWrapPassword = vi.fn(async () => undefined)
    await signIntoForm(
      fakeClient({
        signIn: async () => ({ state: "locked" }),
        unlockWithOldPassword,
        reWrapPassword
      })
    )

    await fill("Previous password", "what it was before")
    await userEvent.click(screen.getByRole("button", { name: "Unlock with my previous password" }))

    expect(await screen.findByText("You are in")).toBeTruthy()
    expect(unlockWithOldPassword).toHaveBeenCalledWith("what it was before")
    expect(reWrapPassword).toHaveBeenCalledWith(
      "mark@markmcdermott.io",
      "a long enough password",
      VAULT
    )
  })

  it("offers to finish a signup that stopped before its keys were stored", async () => {
    const mintVault = vi.fn(async () => ({ ...VAULT, recoveryKey: KEY }))
    await signIntoForm(fakeClient({ signIn: async () => ({ state: "no vault" }), mintVault }))

    await userEvent.click(await screen.findByRole("button", { name: "Make my keys" }))

    expect(await screen.findByTestId("recovery-key")).toHaveProperty("textContent", KEY)
    expect(mintVault).toHaveBeenCalledWith("mark@markmcdermott.io", "a long enough password")
  })
})

describe("keeping the key on this device", () => {
  const keepingForm = (keep: () => Promise<boolean>, drop = vi.fn(async () => undefined)) => {
    render(
      <SignInForm
        client={fakeClient({ signIn: async () => ({ state: "unlocked", ...VAULT }) })}
        keep={keep}
        drop={drop}
      />
    )
    return drop
  }

  const signInWith = async (tick: boolean) => {
    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "a long enough password")
    if (tick) await userEvent.click(screen.getByRole("checkbox"))
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))
  }

  /*
   * Off unless asked. The key this stores decrypts every note, so it is a cost
   * to consent to rather than a convenience to assume — the same rule that
   * keeps the grammar dictionary and the update check off by default.
   */
  /*
   * The label has to say what declining costs. Signing in happens on one page
   * and the app is on another, so an unkept key does not survive the trip —
   * which made declining mean "no sync at all" rather than "ask me again",
   * silently, with nothing anywhere saying so.
   */
  it("says on the label that declining means no syncing", () => {
    render(<SignInForm client={fakeClient()} />)

    expect(screen.getByText(/sync/i).textContent).toMatch(/locally only/i)
  })

  it("stores nothing when the box is left alone", async () => {
    const keep = vi.fn(async () => true)
    keepingForm(keep)

    await signInWith(false)

    expect(await screen.findByText("You are in")).toBeTruthy()
    expect(keep).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Forget this device" })).toBeNull()
  })

  it("stores the key when the box is ticked, and says the device is holding it", async () => {
    const keep = vi.fn(async () => true)
    keepingForm(keep)

    await signInWith(true)

    expect(await screen.findByRole("button", { name: "Forget this device" })).toBeTruthy()
    expect(keep).toHaveBeenCalledWith(VAULT)
  })

  /*
   * A private window, blocked site data, a full quota. The vault is open either
   * way, so the sign-in succeeds and the page simply does not claim to be
   * holding something it is not.
   */
  it("signs in anyway when this browser cannot keep a key", async () => {
    keepingForm(vi.fn(async () => false))

    await signInWith(true)

    expect(await screen.findByText("You are in")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Forget this device" })).toBeNull()
  })

  it("forgets on request, and stops saying it remembers", async () => {
    const drop = keepingForm(vi.fn(async () => true))

    await signInWith(true)
    await userEvent.click(await screen.findByRole("button", { name: "Forget this device" }))

    expect(drop).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Forget this device" })).toBeNull()
  })
})

describe("starting fresh", () => {
  it("mints a new key and shows the one thing to save", async () => {
    const mintVault = vi.fn(async () => ({ ...VAULT, epoch: 2, recoveryKey: KEY }))
    render(
      <StartFreshForm
        client={fakeClient({ signIn: async () => ({ state: "locked" }), mintVault })}
      />
    )

    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "a long enough password")
    await userEvent.click(screen.getByRole("button", { name: "Start fresh" }))

    expect(await screen.findByTestId("recovery-key")).toHaveProperty("textContent", KEY)
  })

  /*
   * The one case worth refusing. If the password opens the vault then nothing
   * is lost and nothing needs replacing — minting here would hide every note
   * they can still read behind a new epoch.
   */
  it("refuses when the password already opens the vault", async () => {
    const mintVault = vi.fn()
    render(
      <StartFreshForm
        client={fakeClient({ signIn: async () => ({ state: "unlocked", ...VAULT }), mintVault })}
      />
    )

    await fill("Email", "mark@markmcdermott.io")
    await fill("Password", "a long enough password")
    await userEvent.click(screen.getByRole("button", { name: "Start fresh" }))

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Your notes opened with that password. Nothing needs replacing."
    )
    expect(mintVault).not.toHaveBeenCalled()
  })
})
