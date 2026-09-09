import { useEffect, useState } from "react"
import { AppInfo, VaultChoice, BackupSummary } from "../../../../shared/types"
import { useNotesStore } from "../../../stores/notesStore"
import { useBlogsStore } from "../../../stores/blogsStore"

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  })
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "note" : "notes"}`
}

/** How many snapshots are worth showing before the list stops being a list. */
const VISIBLE_BACKUPS = 6

export function VaultTab() {
  const restoreFromBackup = useNotesStore((state) => state.restoreFromBackup)
  const load = useNotesStore((state) => state.load)
  const loadBlogs = useBlogsStore((state) => state.load)

  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vaults, setVaults] = useState<VaultChoice[]>([])
  const [switching, setSwitching] = useState(false)

  // The first is always the default, which cannot be forgotten.
  const defaultPath = vaults[0]?.path

  useEffect(() => {
    void window.tova.preferences.listVaults().then(setVaults)
  }, [])

  /** Everything the app is showing belongs to the old vault, so it all reloads. */
  async function after(next: VaultChoice[]) {
    setVaults(next)
    await Promise.all([load(), loadBlogs()])
    setInfo(await window.tova.app.info())
  }

  async function switchTo(path: string) {
    setSwitching(true)
    try {
      await after(await window.tova.preferences.useVault(path))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setSwitching(false)
    }
  }

  async function addVault() {
    setSwitching(true)
    try {
      await after(await window.tova.preferences.addVault())
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setSwitching(false)
    }
  }

  async function forget(path: string) {
    setSwitching(true)
    try {
      await after(await window.tova.preferences.forgetVault(path))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setSwitching(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([window.tova.app.info(), window.tova.backups.list()])
      .then(([loadedInfo, loadedBackups]) => {
        if (cancelled) return
        setInfo(loadedInfo)
        setBackups(loadedBackups)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(describe(cause))
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function backUpNow() {
    setBackingUp(true)
    setError(null)
    try {
      await window.tova.backups.run()
      setBackups(await window.tova.backups.list())
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setBackingUp(false)
    }
  }

  async function reveal(target: "vault" | "backups") {
    try {
      await window.tova.app.reveal(target)
    } catch (cause) {
      setError(describe(cause))
    }
  }

  return (
    <>
      {error !== null && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      <section className="settings-section">
        <h2 className="settings-section-title">Vaults</h2>
        <p className="settings-note">
          Every note is a plain markdown file on this machine. Nothing leaves it. Switching changes
          which folder Tova reads; removing one only stops listing it — the folder and its notes
          stay exactly where they are.
        </p>

        <div className="vaults">
          {vaults.map((vault) => (
            <div key={vault.path} className={`vault-row${vault.active ? " is-active" : ""}`}>
              <button
                type="button"
                className="vault-choose"
                aria-label={vault.active ? `${vault.name}, in use` : `Use ${vault.name}`}
                aria-pressed={vault.active}
                disabled={vault.active || switching}
                onClick={() => void switchTo(vault.path)}
              >
                <span className="vault-name">{vault.name}</span>
                <span className="vault-path">{vault.path}</span>
              </button>

              <button
                type="button"
                className="settings-button"
                aria-label={`Forget ${vault.name}`}
                disabled={vault.path === defaultPath || switching}
                onClick={() => void forget(vault.path)}
              >
                Forget
              </button>
            </div>
          ))}
        </div>

        <div className="settings-row">
          <button
            type="button"
            className="settings-button settings-button-primary"
            disabled={switching}
            onClick={() => void addVault()}
          >
            Add a vault…
          </button>
          <button type="button" className="settings-button" onClick={() => void reveal("vault")}>
            Open folder
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Snapshots</h2>
        <p className="settings-note">
          Restoring replaces the current vault — which is itself backed up first, so a restore is
          never the end of the line. The schedule is on the General tab.
        </p>

        <div className="settings-row">
          <span className="settings-path">{info?.backupPath ?? "…"}</span>
          <button type="button" className="settings-button" onClick={() => void reveal("backups")}>
            Open folder
          </button>
          <button
            type="button"
            className="settings-button settings-button-primary"
            disabled={backingUp}
            onClick={() => void backUpNow()}
          >
            {backingUp ? "Backing up…" : "Back up now"}
          </button>
        </div>

        {backups.length === 0 ? (
          <p className="settings-empty">No snapshots yet.</p>
        ) : (
          <ul className="settings-list">
            {backups.slice(0, VISIBLE_BACKUPS).map((backup) => (
              <li key={backup.name} className="settings-list-row">
                <span className="settings-list-label">
                  {formatWhen(backup.createdAt)}
                  <span className="settings-list-meta">{countLabel(backup.noteCount)}</span>
                </span>

                {confirming === backup.name ? (
                  <span className="settings-confirm">
                    <span className="settings-confirm-text">Replace the current vault?</span>
                    <button
                      type="button"
                      className="settings-button settings-button-danger"
                      onClick={() => void restoreFromBackup(backup.name)}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className="settings-button"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="settings-button"
                    onClick={() => setConfirming(backup.name)}
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">About</h2>
        <dl className="settings-facts">
          <div>
            <dt>Tova</dt>
            <dd>{info?.version ?? "…"}</dd>
          </div>
          <div>
            <dt>Electron</dt>
            <dd>{info?.electron ?? "…"}</dd>
          </div>
          <div>
            <dt>Chromium</dt>
            <dd>{info?.chrome ?? "…"}</dd>
          </div>
        </dl>

        <div className="settings-row">
          <button
            type="button"
            className="settings-button"
            onClick={() =>
              void window.tova.app.openExternal("https://github.com/mark-mcdermott/tova/issues")
            }
          >
            Report a problem
          </button>
        </div>
      </section>
    </>
  )
}
