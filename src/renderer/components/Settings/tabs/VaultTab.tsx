import { useEffect, useState } from "react"
import { AppInfo, BackupSummary } from "../../../../shared/types"
import { useNotesStore } from "../../../stores/notesStore"

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

  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        <h2 className="settings-section-title">Vault</h2>
        <p className="settings-note">
          Every note is a plain markdown file on this machine. Nothing leaves it. Tova keeps one
          vault; several is on the roadmap rather than half-built here.
        </p>

        <div className="settings-row">
          <span className="settings-path">{info?.vaultPath ?? "…"}</span>
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
