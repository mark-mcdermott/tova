import { useEffect, useState } from "react"
import { BlogSummary } from "../../../shared/types"
import { changedLines, lineDiff } from "../../../shared/lineDiff"

interface ConflictResolverProps {
  blog: BlogSummary
  filename: string
  onResolved: () => void
  onCancel: () => void
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * What the two copies actually differ by, and the two ways out. Tova never
 * merges: a post is short enough that choosing a side is honest, and a wrong
 * automatic merge in a published post is worse than a moment's reading.
 */
export function ConflictResolver({ blog, filename, onResolved, onCancel }: ConflictResolverProps) {
  const [versions, setVersions] = useState<{ local: string; remote: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    window.tova.blogs
      .conflict(blog.id, filename)
      .then((loaded) => {
        if (!cancelled) setVersions(loaded)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(describe(cause))
      })

    return () => {
      cancelled = true
    }
  }, [blog.id, filename])

  async function resolve(keep: "local" | "remote") {
    setBusy(true)
    setError(null)
    try {
      await window.tova.blogs.resolve(blog.id, filename, keep)
      onResolved()
    } catch (cause) {
      setError(describe(cause))
      setBusy(false)
    }
  }

  const diff = versions === null ? [] : changedLines(lineDiff(versions.local, versions.remote))

  return (
    <div className="conflict">
      <p className="settings-note">
        <strong>{filename}</strong> changed here and on the blog. Removed lines are this copy; added
        lines are the blog&rsquo;s.
      </p>

      {error !== null && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      {versions === null && error === null ? (
        <p className="settings-empty">Fetching both copies…</p>
      ) : (
        <pre className="conflict-diff">
          {diff.map((line, index) => (
            <span key={index} className={`conflict-line is-${line.kind}`}>
              {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} {line.text}
              {"\n"}
            </span>
          ))}
        </pre>
      )}

      <div className="blog-form-actions">
        <button type="button" className="settings-button" onClick={onCancel}>
          Decide later
        </button>
        <button
          type="button"
          className="settings-button"
          disabled={busy || versions === null}
          onClick={() => void resolve("local")}
        >
          Keep mine
        </button>
        <button
          type="button"
          className="settings-button settings-button-primary"
          disabled={busy || versions === null}
          onClick={() => void resolve("remote")}
        >
          Take the blog&rsquo;s
        </button>
      </div>
    </div>
  )
}
