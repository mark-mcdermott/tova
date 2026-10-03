import { useState } from "react"
import { makeVaultClient, type OpenVault, type VaultClient } from "../../../src/shared/vaultClient"
import { credentials, signOut as endSession } from "../../lib/credentials"
import { forget as dropKey } from "../../lib/keyStore"
import { Field } from "./Field"
import { Problem } from "./Problem"
import { RecoveryKey } from "./RecoveryKey"
import { Submit } from "./Submit"

const live = makeVaultClient(credentials, globalThis.fetch.bind(globalThis))

const SHORTEST = 12

type Props = {
  /** From the verified session, server-side. Never from the page. */
  email: string
  client?: VaultClient
  drop?: () => Promise<void>
  leave?: () => Promise<void>
}

/**
 * Everything that can be done to a vault once you are already inside it.
 *
 * The password is asked for before anything here will work, and that is not
 * friction for its own sake: both key operations need the content key, and the
 * only way to get it is to unwrap an envelope with the password. Changing a
 * password needs the current one regardless, so there is nothing to save by
 * reaching for a key this device might be holding.
 *
 * Which also means this screen never reads from the key store. It only ever
 * clears it.
 */
export function AccountForm({ email, client = live, drop = dropKey, leave = endSession }: Props) {
  const [password, setPassword] = useState("")
  const [vault, setVault] = useState<OpenVault | null>(null)
  const [next, setNext] = useState("")
  const [again, setAgain] = useState("")
  const [changed, setChanged] = useState(false)
  const [replacement, setReplacement] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const tooShort = next !== "" && next.length < SHORTEST
  const mismatched = again !== "" && again !== next

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

  const unlock = (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    return attempt(async () => {
      const result = await client.signIn(email, password)
      if (result.state !== "unlocked") {
        throw new Error("That password does not open this vault.")
      }
      setVault({ contentKey: result.contentKey, epoch: result.epoch })
    })
  }

  const changePassword = (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (vault === null || tooShort || mismatched) return Promise.resolve()

    return attempt(async () => {
      await client.changePassword(email, password, next, vault)
      /*
       * The password this screen holds has to move with it. The vault is still
       * open and the content key is unchanged, so a second operation after this
       * one keeps working — it just has to be told which password opens the
       * envelope now.
       */
      setPassword(next)
      setNext("")
      setAgain("")
      setChanged(true)
    })
  }

  const rotate = (): Promise<void> => {
    if (vault === null) return Promise.resolve()
    return attempt(async () => setReplacement(await client.rotateRecoveryKey(vault)))
  }

  if (replacement !== null) {
    return <RecoveryKey recoveryKey={replacement} done="Done" onDone={() => setReplacement(null)} />
  }

  if (vault === null) {
    return (
      <form onSubmit={unlock} className="flex flex-col gap-5" noValidate>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Encryption and recovery</h1>
          <p className="text-ink-soft text-[15px] leading-relaxed">
            Enter your password to manage your keys. Both of the things on this screen need the key
            your notes are encrypted with, and your password is what unwraps it.
          </p>
        </header>

        {problem !== null && <Problem>{problem}</Problem>}

        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          autoFocus
        />
        <Submit working={working} busy="Unlocking…">
          Continue
        </Submit>

        <div className="border-line flex flex-col gap-3 border-t pt-6">
          <button
            type="button"
            onClick={() => void drop()}
            className="border-line hover:bg-field self-start rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          >
            Forget this device
          </button>
          <p className="text-ink-faint text-sm leading-relaxed">
            Removes the key this browser is holding, if it is holding one. Signing out does not do
            this, and nothing else does.
          </p>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Encryption and recovery</h1>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          Neither of these re-encrypts a note. Your notes are sealed with a key that belongs to you,
          and a password or a recovery key only ever wraps it — so changing one rewrites a single
          row and leaves everything you have written exactly as it is.
        </p>
      </header>

      {problem !== null && <Problem>{problem}</Problem>}

      <form onSubmit={changePassword} className="flex flex-col gap-4" noValidate>
        <h2 className="font-medium">Change your password</h2>
        {changed && (
          <p className="border-line bg-field rounded-lg border px-3 py-2.5 text-sm">
            Your password is changed. Your recovery key still works and was not touched.
          </p>
        )}
        <Field
          label="New password"
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          error={tooShort ? `At least ${SHORTEST} characters.` : null}
          hint={`At least ${SHORTEST} characters.`}
        />
        <Field
          label="New password again"
          type="password"
          value={again}
          onChange={setAgain}
          autoComplete="new-password"
          error={mismatched ? "These two do not match." : null}
        />
        <Submit working={working} busy="Changing…" disabled={tooShort || mismatched || next === ""}>
          Change password
        </Submit>
      </form>

      <div className="border-line flex flex-col gap-4 border-t pt-8">
        <h2 className="font-medium">Replace your recovery key</h2>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          You will be shown a new one once, and the old one stops opening what the server will hand
          over. Worth being exact: the old key still opens an old copy of the envelope if anybody
          kept one. What ends is this server serving it.
        </p>
        <button
          type="button"
          onClick={rotate}
          disabled={working}
          className="bg-accent hover:bg-accent-bright text-accent-ink disabled:bg-field disabled:text-ink-faint self-start rounded-lg px-4 py-2.5 font-medium transition-colors"
        >
          {working ? "Making a new key…" : "Make a new recovery key"}
        </button>
      </div>

      <div className="border-line flex flex-col gap-4 border-t pt-8">
        <h2 className="font-medium">This device</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void drop()}
            className="border-line hover:bg-field rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          >
            Forget this device
          </button>
          <button
            type="button"
            onClick={() => void leave().then(() => location.assign("/signin"))}
            className="border-line hover:bg-field rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          >
            Sign out
          </button>
        </div>
        <p className="text-ink-faint text-sm leading-relaxed">
          Forgetting removes the key this browser is holding. Signing out ends the session and
          leaves that key alone, which is why they are two buttons rather than one.
        </p>
      </div>
    </div>
  )
}
