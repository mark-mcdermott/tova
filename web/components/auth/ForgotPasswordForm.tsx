import { useState } from "react"
import { makeVaultClient, type VaultClient } from "../../../src/shared/vaultClient"
import { credentials } from "../../lib/credentials"
import { Field } from "./Field"
import { Problem } from "./Problem"
import { Submit } from "./Submit"

const live = makeVaultClient(credentials, globalThis.fetch.bind(globalThis))

/**
 * Asks for the reset mail.
 *
 * The answer is the same whether or not the address has an account. This page is public,
 * and a differing reply would say which addresses are registered — the one thing a form
 * like this can leak without anyone noticing.
 *
 * It also says what the mail says, before the mail: a new password gets the account back,
 * the recovery key gets the notes back. Somebody who learns that here can go and find the
 * key before they reset, rather than after, which is the difference between an errand and
 * a dead end.
 */
export function ForgotPasswordForm({ client = live }: { client?: VaultClient } = {}) {
  const [email, setEmail] = useState("")
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function request(event: React.FormEvent) {
    event.preventDefault()
    setProblem(null)
    setWorking(true)
    try {
      await client.requestReset(email)
      setSent(true)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "That did not work")
    } finally {
      setWorking(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="text-ink-soft text-[15px] leading-relaxed">
            If that address has an account, a reset link is on its way. The link expires shortly.
          </p>
        </header>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          <strong>Find your recovery key before you use it.</strong> A new password signs you back
          in, but your notes are sealed with a key only you hold — the recovery key is what re-opens
          them, and sign-in will ask for it.
        </p>
        <p className="text-ink-faint text-sm">
          <a href="/signin" className="text-accent hover:text-accent-bright underline">
            Back to sign in
          </a>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={request} className="flex flex-col gap-5" noValidate>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          We will email you a link. Have your recovery key to hand — a new password signs you in,
          but only the recovery key re-opens your notes.
        </p>
      </header>
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        autoFocus
      />
      {problem === null ? null : <Problem>{problem}</Problem>}
      <Submit working={working} busy="Sending…">
        Email me a link
      </Submit>
      <p className="text-ink-faint text-sm">
        <a href="/signin" className="text-accent hover:text-accent-bright underline">
          Back to sign in
        </a>
      </p>
    </form>
  )
}
