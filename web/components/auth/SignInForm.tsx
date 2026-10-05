import { useState } from "react"
import {
  makeVaultClient,
  type NewVaultResult,
  type OpenVault,
  type VaultClient
} from "../../../src/shared/vaultClient"
import { credentials } from "../../lib/credentials"
import { forgetThisDevice } from "../../lib/forget"
import { keepIfPossible } from "../../lib/keyStore"
import { Field } from "./Field"
import { Problem } from "./Problem"
import { Ready } from "./Ready"
import { RecoveryKey } from "./RecoveryKey"
import { Submit } from "./Submit"

/**
 * The one built against the real server.
 *
 * Injectable, for the reason `Credentials` is an interface: the branching in
 * here is the part worth testing, and a test that reached a real Better Auth
 * would be testing Better Auth. Astro passes no props, so this is what runs.
 */
const live = makeVaultClient(credentials, globalThis.fetch.bind(globalThis))

/**
 * What the page is asking for right now.
 *
 * `locked` and `no vault` are states a sign-in can legitimately end in, not
 * errors, and each has a screen. They are here rather than on their own URLs
 * because both need the email and password that were just typed — moving them
 * to another page would mean carrying credentials through browser storage to
 * reach a screen that is one click away.
 */
type Asking = "credentials" | "locked" | "no vault"

type Props = {
  client?: VaultClient
  /** Injected for the same reason the client is: this one touches IndexedDB. */
  keep?: (vault: OpenVault) => Promise<boolean>
  drop?: () => Promise<void>
}

export function SignInForm({
  client = live,
  keep = keepIfPossible,
  drop = forgetThisDevice
}: Props = {}) {
  const [asking, setAsking] = useState<Asking>("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [recoveryKey, setRecoveryKey] = useState("")
  const [oldPassword, setOldPassword] = useState("")
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [keeping, setKeeping] = useState(false)
  const [remembered, setRemembered] = useState(false)
  const [minted, setMinted] = useState<NewVaultResult | null>(null)

  /** Runs one step, and puts whatever it throws where the reader is looking. */
  async function attempt(step: () => Promise<void>): Promise<void> {
    setWorking(true)
    setProblem(null)
    try {
      await step()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not work")
    } finally {
      setWorking(false)
    }
  }

  /** Every path that ends with an open vault ends here. */
  async function opened(vault: OpenVault): Promise<void> {
    if (keeping) setRemembered(await keep(vault))
    setOpen(true)
  }

  const signIn = (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    return attempt(async () => {
      const result = await client.signIn(email, password)
      // The vault out of the result, not the result: `state` is how this file
      // decided what to do and has no business travelling any further.
      if (result.state === "unlocked") {
        await opened({ contentKey: result.contentKey, epoch: result.epoch })
      } else setAsking(result.state)
    })
  }

  const recover = (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    return attempt(async () => {
      await opened(await client.recoverAfterReset(email, password, recoveryKey))
    })
  }

  const finishChange = (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    return attempt(async () => {
      const vault = await client.unlockWithOldPassword(oldPassword)
      // The change that stopped halfway, finished. Only the envelope moves:
      // the credential is already the password that just signed in.
      await client.reWrapPassword(email, password, vault)
      await opened(vault)
    })
  }

  const mint = (): Promise<void> =>
    attempt(async () => setMinted(await client.mintVault(email, password)))

  if (open) {
    return (
      <Ready
        heading="You are in"
        remembered={remembered}
        onForget={() => {
          setRemembered(false)
          void drop()
        }}
      />
    )
  }
  if (minted !== null) {
    return (
      <RecoveryKey recoveryKey={minted.recoveryKey} done="Finish" onDone={() => setOpen(true)} />
    )
  }

  if (asking === "no vault") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-semibold tracking-tight">Finish setting up</h1>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          Your account exists but its keys were never stored — the last step of signing up did not
          finish. Making them now takes a moment and nothing is lost.
        </p>
        {problem !== null && <Problem>{problem}</Problem>}
        <button
          type="button"
          onClick={mint}
          disabled={working}
          className="bg-accent hover:bg-accent-bright text-accent-ink rounded-lg px-4 py-2.5 font-medium transition-colors disabled:bg-field disabled:text-ink-faint"
        >
          {working ? "Making your keys…" : "Make my keys"}
        </button>
      </div>
    )
  }

  if (asking === "locked") {
    return (
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Your notes are still locked</h1>
          <p className="text-ink-soft text-[15px] leading-relaxed">
            Your password is right — you are signed in. But your notes are encrypted with a key that
            password no longer unwraps, which happens after a password reset. Tova never had that
            key, so it cannot do this part for you.
          </p>
        </header>

        {problem !== null && <Problem>{problem}</Problem>}

        <form onSubmit={recover} className="flex flex-col gap-4" noValidate>
          <Field
            label="Recovery key"
            type="text"
            value={recoveryKey}
            onChange={setRecoveryKey}
            autoComplete="off"
            autoFocus
            hint="Six groups of four. Upper or lower case, dashes or spaces — however you wrote it down."
          />
          <Submit working={working} busy="Unlocking…">
            Unlock with my recovery key
          </Submit>
        </form>

        <div className="border-line flex flex-col gap-4 border-t pt-7">
          <p className="text-ink-soft text-[15px] leading-relaxed">
            Or, if your password change was interrupted rather than reset, the password you had
            before will still open it.
          </p>
          <form onSubmit={finishChange} className="flex flex-col gap-4" noValidate>
            <Field
              label="Previous password"
              type="password"
              value={oldPassword}
              onChange={setOldPassword}
              autoComplete="off"
            />
            <Submit working={working} busy="Unlocking…">
              Unlock with my previous password
            </Submit>
          </form>
        </div>

        <p className="text-ink-faint text-sm">
          <a href="/no-recovery-key" className="text-accent hover:text-accent-bright underline">
            I do not have my recovery key
          </a>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={signIn} className="flex flex-col gap-5" noValidate>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          Your password both signs you in and unwraps your notes, on this device.
        </p>
      </header>

      {problem !== null && <Problem>{problem}</Problem>}

      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        autoFocus
      />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />

      {/*
        The only route back in for somebody who cannot sign in. Until the reset mail
        existed there was nothing to link to, which is why this is new rather than
        having been here all along.
      */}
      <p className="text-ink-faint -mt-2 text-sm">
        <a href="/forgot-password" className="text-accent hover:text-accent-bright underline">
          Forgot your password?
        </a>
      </p>

      {/*
        Unticked, and it stays that way unless somebody says otherwise. The key
        this keeps is what decrypts every note, so putting it on disk is a cost
        to consent to rather than a convenience to assume.

        What it costs to decline has to be on the label, though. Signing in
        happens here and the app is on another page, so an unkept key does not
        survive the trip — which made declining mean "no sync at all" rather
        than "ask me again", silently, with nothing anywhere saying so.
      */}
      <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={keeping}
          onChange={(event) => setKeeping(event.target.checked)}
          className="accent-accent mt-0.5 size-4"
        />
        <span>
          Keep this device unlocked
          <span className="text-ink-faint block text-sm">
            Stores your key in this browser, so your notes can sync and it does not ask again.
            Without it this browser writes locally only. Tick it on a device you trust.
          </span>
        </span>
      </label>

      <Submit working={working} busy="Unlocking…">
        Sign in
      </Submit>

      <p className="text-ink-faint text-sm">
        No account yet?{" "}
        <a href="/signup" className="text-accent hover:text-accent-bright underline">
          Make one
        </a>
      </p>
    </form>
  )
}
