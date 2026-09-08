import { useEffect, useReducer } from "react"
import { createPortal } from "react-dom"
import { PublishUpdate } from "../../../shared/types"
import { usePublishStore } from "../../stores/publishStore"

const TITLES: Record<PublishUpdate["phase"], string> = {
  preparing: "Publishing…",
  pushing: "Publishing…",
  building: "Publishing…",
  published: "Published!",
  failed: "Publish failed"
}

function Toast({ update, startedAt }: { update: PublishUpdate; startedAt: number }) {
  const dismiss = usePublishStore((state) => state.dismiss)

  // The elapsed count is the only part that moves on its own.
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (update.phase === "published" || update.phase === "failed") return
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [update.phase])

  const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000))

  return (
    <div className={`publish-toast is-${update.phase}`} role="status">
      <div className="publish-toast-head">
        <span className="publish-toast-title">{TITLES[update.phase]}</span>
        <button
          type="button"
          className="publish-toast-close"
          aria-label="Dismiss"
          onClick={() => dismiss(update.id)}
        >
          ✕
        </button>
      </div>

      <div className="publish-toast-track">
        <div className="publish-toast-bar" style={{ width: `${update.progress}%` }} />
      </div>

      <div className="publish-toast-foot">
        <span className="publish-toast-message">
          {update.error ?? update.message}
          {update.phase === "published" && update.url !== null && (
            <>
              {" "}
              <button
                type="button"
                className="publish-toast-link"
                onClick={() => void window.tova.app.openExternal(update.url as string)}
              >
                View post
              </button>
            </>
          )}
        </span>
        <span className="publish-toast-elapsed">{elapsed}s</span>
      </div>
    </div>
  )
}

/**
 * Top-right, and never in the way: publishing is slow enough that the writer
 * should be able to keep working through it.
 */
export function PublishToasts() {
  const jobs = usePublishStore((state) => state.jobs)
  const apply = usePublishStore((state) => state.apply)

  useEffect(() => {
    return window.tova.publish.onUpdate(apply)
  }, [apply])

  if (jobs.length === 0) return null

  return createPortal(
    <div className="publish-toasts">
      {jobs.map((job) => (
        <Toast key={job.id} update={job} startedAt={startedAtFor(job.id)} />
      ))}
    </div>,
    document.body
  )
}

/** First sighting of an attempt is when its clock starts. */
const starts = new Map<string, number>()

function startedAtFor(id: string): number {
  const existing = starts.get(id)
  if (existing !== undefined) return existing

  const now = Date.now()
  starts.set(id, now)
  return now
}
