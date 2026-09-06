import { VaultStatus } from "../../shared/types"
import { useNotesStore } from "../stores/notesStore"

interface VaultWarningProps {
  status: VaultStatus
}

function describeBackup(createdAt: number, noteCount: number): string {
  const when = new Date(createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  })
  return `${when} · ${noteCount} ${noteCount === 1 ? "note" : "notes"}`
}

/**
 * Shown when the vault is empty but backups exist — the shape of a sync error
 * or an accidental delete, and the moment where losing data becomes permanent
 * if the user just starts typing over it.
 */
export function VaultWarning({ status }: VaultWarningProps) {
  const restoreFromBackup = useNotesStore((state) => state.restoreFromBackup)
  const newest = status.backups[0]

  return (
    <div className="vault-warning" role="alert">
      <h2 className="vault-warning-title">Your vault is empty</h2>
      <p className="vault-warning-body">
        No notes were found, but {status.backups.length}{" "}
        {status.backups.length === 1 ? "backup exists" : "backups exist"}. Restoring replaces the
        current vault — the existing one is backed up first.
      </p>

      <div className="vault-warning-actions">
        <button
          type="button"
          className="button-primary"
          onClick={() => restoreFromBackup(newest.name)}
        >
          Restore {describeBackup(newest.createdAt, newest.noteCount)}
        </button>
      </div>
    </div>
  )
}
