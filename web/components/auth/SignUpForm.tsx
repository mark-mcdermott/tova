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
 * The shortest password worth accepting.
 *
 * Not a rule about punctuation. This password derives the key that wraps the
 * key your notes are encrypted with, and the only way back past a weak one is
 * the recovery key — so the length is the whole of the guard, and the form is
 * the place to argue about it rather than the server, which only ever sees a
 * scrypt output.
 */
const SHORTEST = 12

/**
 * The one built against the real server.
 *
 * Injectable, for the reason `Credentials` is an interface: the branching in
 * here is the part worth testing, and a test that reached a real Better Auth
 * would be testing Better Auth. Astro passes no props, so this is what runs.
 */
const live = makeVaultClient(credentials, globalThis.fetch.bind(globalThis))

/**
 * Three steps, one page, one island.
 *
 * One page because the recovery key has to be shown immediately after it is
 * minted and must not travel: putting step two on its own URL would mean
 * carrying the key through `sessionStorage`, which is a copy of it written to
 * disk by the browser for no reason at all.
 */
export function SignUpForm({ client = live }: { client?: VaultClient } = {}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [again, setAgain] = useState("")
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [vault, setVault] = useState<NewVaultResult | null>(null)
  const [finished, setFinished] = useState(false)

  const tooShort = password !== "" && password.length < SHORTEST
  const mismatched = again !== "" && again !== password

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (tooShort || mismatched) return

    setWorking(true)
    setProblem(null)
    try {
      setVault(await client.signUp(email, password, name))
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not work")
    } finally {
      setWorking(false)
    }
  }

  if (finished) return <Ready heading="Your vault is ready" />

  if (vault !== null) {
    return (
      <RecoveryKey recoveryKey={vault.recoveryKey} done="Finish" onDone={() => setFinished(true)} />
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Make an account</h1>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          Your notes are encrypted before they leave your device. Tova cannot read them, which is
          also why your password matters more here than elsewhere.
        </p>
      </header>

      {problem !== null && <Problem>{problem}</Problem>}

      <Field
        label="Name"
        type="text"
        value={name}
        onChange={setName}
        autoComplete="name"
        autoFocus
      />
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        error={tooShort ? `At least ${SHORTEST} characters.` : null}
        hint={`At least ${SHORTEST} characters. It wraps the key your notes are encrypted with.`}
      />
      <Field
        label="Password again"
        type="password"
        value={again}
        onChange={setAgain}
        autoComplete="new-password"
        error={mismatched ? "These two do not match." : null}
      />

      <Submit working={working} busy="Making your keys…" disabled={tooShort || mismatched}>
        Create account
      </Submit>

      <p className="text-ink-faint text-sm">
        Already have an account?{" "}
        <a href="/signin" className="text-accent hover:text-accent-bright underline">
          Sign in
        </a>
      </p>
    </form>
  )
}
