import { useEffect, useState } from "react"
import { Blog, BlogSecret, BlogSummary, SyncResult } from "../../../shared/types"
import { EMPTY_BLOG } from "../../../shared/blogConfig"
import { useBlogsStore } from "../../stores/blogsStore"
import { BlogForm } from "./BlogForm"
import { formatEditedAgo } from "../../../shared/date"

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function deployLabel(blog: BlogSummary): string {
  if (blog.deploy.provider === "cloudflare") return `Cloudflare · ${blog.deploy.projectName}`
  if (blog.deploy.provider === "vercel") return "Vercel"
  return "Push only"
}

function syncLabel(lastSyncedAt: number): string {
  if (lastSyncedAt === 0) return "never synced"
  return formatEditedAgo(lastSyncedAt).replace("Edited ", "synced ")
}

/** What a sync actually did, in the order the writer needs to hear it. */
function syncReport(result: SyncResult): string {
  const parts: string[] = []
  if (result.imported > 0) parts.push(`${result.imported} imported`)
  if (result.updated > 0) parts.push(`${result.updated} updated`)
  if (result.unchanged > 0) parts.push(`${result.unchanged} unchanged`)

  if (result.conflicts.length > 0) {
    parts.push(`${result.conflicts.length} changed on both sides — left alone`)
  }
  if (result.awaitingPublish.length > 0) {
    parts.push(`${result.awaitingPublish.length} edited here, waiting for the rocket`)
  }
  if (result.removedRemotely.length > 0) {
    parts.push(`${result.removedRemotely.length} gone from the blog but kept here`)
  }

  return parts.length === 0 ? "Nothing to do." : `${parts.join(" · ")}.`
}

type Editing = { blog: Blog; summary: BlogSummary | null } | null

export function BlogSection() {
  const blogs = useBlogsStore((state) => state.blogs)
  const canStoreSecrets = useBlogsStore((state) => state.canStoreSecrets)
  const loadBlogs = useBlogsStore((state) => state.load)
  const saveBlog = useBlogsStore((state) => state.save)
  const removeBlog = useBlogsStore((state) => state.remove)
  const syncBlog = useBlogsStore((state) => state.sync)
  const lastSynced = useBlogsStore((state) => state.lastSynced)
  const syncing = useBlogsStore((state) => state.syncing)
  const results = useBlogsStore((state) => state.results)

  const [editing, setEditing] = useState<Editing>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadBlogs().catch((cause: unknown) => setError(describe(cause)))
  }, [loadBlogs])

  async function save(blog: Blog, secrets: Partial<Record<BlogSecret, string>>) {
    setError(null)
    try {
      await saveBlog(blog, secrets)
      setEditing(null)
    } catch (cause) {
      setError(describe(cause))
    }
  }

  async function sync(id: string) {
    setError(null)
    try {
      await syncBlog(id)
    } catch (cause) {
      setError(describe(cause))
    }
  }

  async function remove(id: string) {
    setError(null)
    try {
      await removeBlog(id)
      setConfirming(null)
    } catch (cause) {
      setError(describe(cause))
    }
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Blogs</h2>
      <p className="settings-note">
        A blog is a repository Tova pushes posts to. Its name is the handle you type —{" "}
        <code>@name post</code> — and its token is encrypted with your keychain, never written into
        the vault.
      </p>

      {error !== null && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      {editing !== null ? (
        <BlogForm
          blog={editing.blog}
          existing={blogs}
          canStoreSecrets={canStoreSecrets}
          hasGithubToken={editing.summary?.hasGithubToken ?? false}
          hasDeployToken={editing.summary?.hasDeployToken ?? false}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          {blogs.length === 0 ? (
            <p className="settings-empty">No blogs yet.</p>
          ) : (
            <ul className="settings-list">
              {blogs.map((blog) => (
                <li key={blog.id} className="settings-list-row">
                  <span className="settings-list-label">
                    {blog.name}
                    <span className="settings-list-meta">
                      {blog.github.repo} · {deployLabel(blog)}
                      {blog.hasGithubToken ? "" : " · no token"}
                      {" · "}
                      {syncLabel(lastSynced[blog.id] ?? 0)}
                    </span>
                  </span>

                  {confirming === blog.id ? (
                    <span className="settings-confirm">
                      <span className="settings-confirm-text">
                        Delete {blog.name}? This has no effect on the live blog.
                      </span>
                      <button
                        type="button"
                        className="settings-button settings-button-danger"
                        onClick={() => void remove(blog.id)}
                      >
                        Delete
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
                    <span className="settings-row-actions">
                      <button
                        type="button"
                        className="settings-button"
                        disabled={syncing.includes(blog.id) || !blog.hasGithubToken}
                        onClick={() => void sync(blog.id)}
                      >
                        {syncing.includes(blog.id) ? "Syncing…" : "Sync"}
                      </button>
                      <button
                        type="button"
                        className="settings-button"
                        onClick={() => setEditing({ blog, summary: blog })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="settings-button"
                        onClick={() => setConfirming(blog.id)}
                      >
                        Delete
                      </button>
                    </span>
                  )}

                  {results[blog.id] !== undefined && (
                    <p className="settings-sync-report">{syncReport(results[blog.id])}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="settings-row">
            <button
              type="button"
              className="settings-button settings-button-primary"
              onClick={() => setEditing({ blog: EMPTY_BLOG, summary: null })}
            >
              Add blog
            </button>
          </div>
        </>
      )}
    </section>
  )
}
