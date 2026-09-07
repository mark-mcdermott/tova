import { useEffect, useState } from "react"
import { AppInfo, BackupSummary } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { Icon } from "../Sidebar/icons"

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

export function Settings() {
  const activeId = useNotesStore((state) => state.activeId)
  const open = useNotesStore((state) => state.open)
  const openToday = useNotesStore((state) => state.openToday)
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

  // Leaves settings the way the user arrived: back to whatever was open, or to
  // today's note if nothing was.
  function close() {
    if (activeId === null) void openToday()
    else void open(activeId)
  }

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
    <div className="editor-shell">
      <div className="editor-header">
        <nav className="editor-nav" aria-label="Settings navigation">
          <button
            type="button"
            className="icon-button"
            title="Back to writing"
            aria-label="Back to writing"
            onClick={close}
          >
            <Icon name="back" className="nav-icon" />
          </button>

          <ol className="breadcrumb">
            <li>
              <span className="breadcrumb-current">Settings</span>
            </li>
          </ol>
        </nav>

        <h1 className="settings-heading">Settings</h1>
      </div>

      <div className="settings-body">
        {error !== null && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}

        <section className="settings-section">
          <h2 className="settings-section-title">Vault</h2>
          <p className="settings-note">
            Every note is a plain markdown file on this machine. Nothing leaves it.
          </p>

          <div className="settings-row">
            <span className="settings-path">{info?.vaultPath ?? "…"}</span>
            <button type="button" className="settings-button" onClick={() => void reveal("vault")}>
              Open folder
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Backups</h2>
          <p className="settings-note">
            Tova snapshots the vault at launch and every hour after. Restoring replaces the current
            vault — which is itself backed up first, so a restore is never the end of the line.
          </p>

          <div className="settings-row">
            <span className="settings-path">{info?.backupPath ?? "…"}</span>
            <button
              type="button"
              className="settings-button"
              onClick={() => void reveal("backups")}
            >
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
        </section>
      </div>
    </div>
  )
}
