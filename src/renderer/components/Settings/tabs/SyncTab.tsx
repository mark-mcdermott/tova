import { useEffect, useState } from "react"
import { desktopSignIn, desktopSignOut } from "../../../sync/signIn"
import { Field } from "../Field"

/**
 * An account, so this Mac is one of the devices rather than the only one.
 *
 * Signing in, and nothing else. An account is made at tova.so, where the
 * recovery key is shown on a screen built to show it once and never again —
 * and a second screen doing that is how two of them come to disagree about the
 * most consequential moment in the product.
 */
export function SyncTab() {
  const [account, setAccount] = useState<string | null | "unknown">("unknown")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    void window.tova.sync.account().then(setAccount)
  }, [])

  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    setWorking(true)
    setProblem(null)

    try {
      const result = await desktopSignIn(email, password)
      if (result === "unlocked") {
        setAccount(email)
        setPassword("")
        return
      }

      /*
       * Two states that are not errors, told apart because what to do differs.
       * A reset needs the recovery key; a signup that stopped needs finishing.
       * Both live on the web for now, and saying so is better than a button
       * that is not there.
       */
      setProblem(
        result === "locked"
          ? "Your password is right, and your notes are sealed with a key it no longer opens — which happens after a password reset. Sign in at tova.so to unlock them with your recovery key."
          : "This account has no keys yet. Finish signing up at tova.so and then come back."
      )
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not work")
    } finally {
      setWorking(false)
    }
  }

  async function signOut() {
    setWorking(true)
    try {
      await desktopSignOut()
      setAccount(null)
    } finally {
      setWorking(false)
    }
  }

  if (account === "unknown") return null

  if (account !== null) {
    return (
      <div className="settings-panel">
        <h2>Sync</h2>
        <p className="settings-note">
          Signed in as {account}. Notes written here reach your other devices, and theirs reach this
          one — encrypted before they leave, with a key this Mac keeps in its keychain.
        </p>
        <button
          type="button"
          className="danger-button"
          onClick={() => void signOut()}
          disabled={working}
        >
          Sign out
        </button>
        <p className="settings-note">
          Signing out ends the session and removes the key from this Mac. Your notes stay in your
          vault, as the files they have always been.
        </p>
      </div>
    )
  }

  return (
    <form className="settings-panel" onSubmit={(event) => void signIn(event)}>
      <h2>Sync</h2>
      <p className="settings-note">
        Tova works without an account and always will. Signing in adds your other devices — your
        notes are encrypted here, with a key the server never sees.
      </p>

      <Field id="sync-email" label="Email">
        <input
          id="sync-email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field id="sync-password" label="Password" error={problem ?? undefined}>
        <input
          id="sync-password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <button type="submit" disabled={working || email === "" || password === ""}>
        {working ? "Signing in…" : "Sign in"}
      </button>

      <p className="settings-note">
        No account yet? Make one at tova.so — it shows a recovery key once, and that screen is the
        one thing that cannot be done twice.
      </p>
    </form>
  )
}
