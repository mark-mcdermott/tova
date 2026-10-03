import { useState } from "react"
import {
  makeVaultClient,
  type NewVaultResult,
  type VaultClient
} from "../../../src/shared/vaultClient"
import { credentials } from "../../lib/credentials"
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
 * The honest end of the road, and the one real thing left to offer.
 *
 * A reset password and no recovery key means those notes cannot be read by
 * anyone, including Tova. Starting fresh mints a new key under a new epoch and
 * leaves the old notes exactly where they are, sealed — not deleted, because
 * the whole premise of a recovery key is that people find things late, and
 * deleting would be the one irreversible step taken on their behalf on the
 * screen whose message is that nothing can be done for them.
 *
 * The password is asked for again rather than carried here. This screen is
 * reachable by typing its address, and it should not act on an account on the
 * strength of that.
 */
export function StartFreshForm({ client = live }: { client?: VaultClient } = {}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [minted, setMinted] = useState<NewVaultResult | null>(null)
  const [open, setOpen] = useState(false)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setWorking(true)
    setProblem(null)
    try {
      // Signed in first, because minting writes to the vault and the server
      // will refuse it otherwise — and because a wrong password should fail
      // here rather than after a key has been made.
      const result = await client.signIn(email, password)
      if (result.state === "unlocked") {
        setProblem("Your notes opened with that password. Nothing needs replacing.")
        return
      }
      setMinted(await client.mintVault(email, password))
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not work")
    } finally {
      setWorking(false)
    }
  }

  if (open) return <Ready heading="Starting fresh" />
  if (minted !== null) {
    return (
      <RecoveryKey recoveryKey={minted.recoveryKey} done="Finish" onDone={() => setOpen(true)} />
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">There is no other way in</h1>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          A reset password and no recovery key means the notes you wrote before cannot be read — not
          by you, and not by Tova. Your notes were encrypted on your device with a key we have never
          held, which is the same property that makes them private.
        </p>
      </header>

      <div className="border-line flex flex-col gap-3 border-t pt-7">
        <h2 className="font-medium">If you have an export</h2>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          Tova writes plain markdown files. A backup, a folder you copied, or a Time Machine
          snapshot can be opened in the desktop app and will sync up from there.
        </p>
      </div>

      <form onSubmit={submit} className="border-line flex flex-col gap-4 border-t pt-7" noValidate>
        <h2 className="font-medium">Otherwise, start fresh</h2>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          A new key, and a new recovery key to save. Your old notes stay where they are rather than
          being deleted — if that key turns up in a drawer next year, they will open.
        </p>

        {problem !== null && <Problem>{problem}</Problem>}

        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <Submit working={working} busy="Making a new key…">
          Start fresh
        </Submit>
      </form>
    </div>
  )
}
