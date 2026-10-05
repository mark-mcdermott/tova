import { useState } from "react"
import { makeVaultClient, type VaultClient } from "../../../src/shared/vaultClient"
import { credentials } from "../../lib/credentials"
import { Field } from "./Field"
import { Problem } from "./Problem"
import { Submit } from "./Submit"

const live = makeVaultClient(credentials, globalThis.fetch.bind(globalThis))

const MIN_LENGTH = 8

/**
 * Sets the new password from the emailed link.
 *
 * The email is asked for again rather than carried in the URL. It is the scrypt salt
 * (`accountKeys.ts`), so the derivation needs it — and putting an address in a link that
 * lands in an inbox, a browser history and a server log is worth avoiding when the person
 * reading the page knows it anyway.
 *
 * What this cannot do is re-open the notes, and the screen says so rather than letting
 * somebody discover it at the next sign-in. The content key is sealed once per factor;
 * a new password derives a different wrapping key, so the password envelope stays shut.
 * Sign-in asks for the recovery key next, and `/no-recovery-key` is the honest end of the
 * road for anyone without one.
 */
export function ResetPasswordForm({ client = live }: { client?: VaultClient } = {}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function reset(event: React.FormEvent) {
    event.preventDefault()
    setProblem(null)

    if (password.length < MIN_LENGTH) {
      setProblem(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setProblem("Those two do not match.")
      return
    }

    const token = new URLSearchParams(window.location.search).get("token")
    if (token === null || token === "") {
      setProblem("This link is missing its token. Ask for a new reset email.")
      return
    }

    setWorking(true)
    try {
      await client.resetPassword(email, password, token)
      setDone(true)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "That did not work")
    } finally {
      setWorking(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Password changed</h1>
          <p className="text-ink-soft text-[15px] leading-relaxed">
            Sign in with it, and have your recovery key ready — your notes are still sealed under
            the old password, and the recovery key is what re-opens them.
          </p>
        </header>
        <p className="text-ink-faint text-sm">
          <a href="/signin" className="text-accent hover:text-accent-bright underline">
            Sign in
          </a>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={reset} className="flex flex-col gap-5" noValidate>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          This gets your account back. Your notes come back with the recovery key, which sign-in
          will ask for next.
        </p>
      </header>
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        hint="The address you asked to reset."
        autoFocus
      />
      <Field
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={`At least ${MIN_LENGTH} characters.`}
      />
      <Field
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />
      {problem === null ? null : <Problem>{problem}</Problem>}
      <Submit working={working} busy="Changing…">
        Change my password
      </Submit>
      <p className="text-ink-faint text-sm">
        <a href="/no-recovery-key" className="text-accent hover:text-accent-bright underline">
          I do not have my recovery key
        </a>
      </p>
    </form>
  )
}
