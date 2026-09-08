import { FormEvent, useState } from "react"
import { Blog, BlogSecret, BlogSummary, DeployProvider } from "../../../shared/types"
import { validateBlog } from "../../../shared/blogConfig"
import { Field } from "./Field"

interface BlogFormProps {
  blog: Blog
  existing: BlogSummary[]
  /** Whether the machine can encrypt a token at all. */
  canStoreSecrets: boolean
  hasGithubToken: boolean
  hasDeployToken: boolean
  onSave: (blog: Blog, secrets: Partial<Record<BlogSecret, string>>) => Promise<void>
  onCancel: () => void
}

const PROVIDERS: { value: DeployProvider; label: string }[] = [
  { value: "none", label: "None — push only" },
  { value: "cloudflare", label: "Cloudflare Pages" },
  { value: "vercel", label: "Vercel" }
]

/** What a stored token's field says, since the value itself never comes back. */
function tokenPlaceholder(stored: boolean): string {
  return stored ? "Stored — type to replace" : "Paste a token"
}

export function BlogForm({
  blog: initial,
  existing,
  canStoreSecrets,
  hasGithubToken,
  hasDeployToken,
  onSave,
  onCancel
}: BlogFormProps) {
  const [blog, setBlog] = useState<Blog>(initial)
  const [githubToken, setGithubToken] = useState("")
  const [deployToken, setDeployToken] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<Blog>) => setBlog((current) => ({ ...current, ...patch }))
  const setGithub = (patch: Partial<Blog["github"]>) =>
    setBlog((current) => ({ ...current, github: { ...current.github, ...patch } }))
  const setDeploy = (patch: Partial<Blog["deploy"]>) =>
    setBlog((current) => ({ ...current, deploy: { ...current.deploy, ...patch } }))

  async function submit(event: FormEvent) {
    event.preventDefault()

    const found = validateBlog(blog, existing)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const secrets: Partial<Record<BlogSecret, string>> = {}
    if (githubToken !== "") secrets.github = githubToken
    if (deployToken !== "" && blog.deploy.provider !== "none") {
      secrets[blog.deploy.provider] = deployToken
    }

    setSaving(true)
    try {
      await onSave(blog, secrets)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="blog-form" onSubmit={(event) => void submit(event)}>
      <Field
        id="blog-name"
        label="Blog name"
        hint="Also the handle you type: @name post"
        error={errors.name}
      >
        <input
          id="blog-name"
          className="text-input"
          value={blog.name}
          placeholder="markmcdermott.io"
          onChange={(event) => set({ name: event.target.value })}
        />
      </Field>

      <Field id="blog-label" label="Sidebar label" hint="Optional. Falls back to the blog name.">
        <input
          id="blog-label"
          className="text-input"
          value={blog.sidebarLabel}
          placeholder="My Blog"
          onChange={(event) => set({ sidebarLabel: event.target.value })}
        />
      </Field>

      <Field id="blog-site" label="Site URL" hint="Used to link a post once it is live.">
        <input
          id="blog-site"
          className="text-input"
          value={blog.siteUrl}
          placeholder="https://markmcdermott.io"
          onChange={(event) => set({ siteUrl: event.target.value })}
        />
      </Field>

      <Field
        id="blog-live-path"
        label="Live post path"
        hint="Where posts appear on the site, e.g. /posts/"
      >
        <input
          id="blog-live-path"
          className="text-input"
          value={blog.livePostPath}
          placeholder="/posts/"
          onChange={(event) => set({ livePostPath: event.target.value })}
        />
      </Field>

      <Field id="blog-repo" label="Repository" hint="owner/repo" error={errors.repo}>
        <input
          id="blog-repo"
          className="text-input"
          value={blog.github.repo}
          placeholder="mark-mcdermott/blog"
          onChange={(event) => setGithub({ repo: event.target.value })}
        />
      </Field>

      <Field id="blog-branch" label="Branch" error={errors.branch}>
        <input
          id="blog-branch"
          className="text-input"
          value={blog.github.branch}
          onChange={(event) => setGithub({ branch: event.target.value })}
        />
      </Field>

      <Field
        id="blog-path"
        label="Content path"
        hint="Where posts live in the repository."
        error={errors.contentPath}
      >
        <input
          id="blog-path"
          className="text-input"
          value={blog.github.contentPath}
          placeholder="src/content/posts/"
          onChange={(event) => setGithub({ contentPath: event.target.value })}
        />
      </Field>

      <Field
        id="blog-token"
        label="GitHub token"
        hint={
          canStoreSecrets
            ? "Encrypted with your keychain. It is never shown again once saved."
            : "This machine has no keychain available, so a token cannot be stored safely."
        }
      >
        <input
          id="blog-token"
          className="text-input"
          type="password"
          autoComplete="off"
          disabled={!canStoreSecrets}
          value={githubToken}
          placeholder={tokenPlaceholder(hasGithubToken)}
          onChange={(event) => setGithubToken(event.target.value)}
        />
      </Field>

      <Field id="blog-provider" label="Deploys on" hint="Used to follow a build after pushing.">
        <select
          id="blog-provider"
          className="text-input"
          value={blog.deploy.provider}
          onChange={(event) => setDeploy({ provider: event.target.value as DeployProvider })}
        >
          {PROVIDERS.map((provider) => (
            <option key={provider.value} value={provider.value}>
              {provider.label}
            </option>
          ))}
        </select>
      </Field>

      {blog.deploy.provider === "cloudflare" && (
        <>
          <Field id="blog-account" label="Account ID" error={errors.accountId}>
            <input
              id="blog-account"
              className="text-input"
              value={blog.deploy.accountId}
              onChange={(event) => setDeploy({ accountId: event.target.value })}
            />
          </Field>

          <Field id="blog-project" label="Project name" error={errors.projectName}>
            <input
              id="blog-project"
              className="text-input"
              value={blog.deploy.projectName}
              onChange={(event) => setDeploy({ projectName: event.target.value })}
            />
          </Field>
        </>
      )}

      {blog.deploy.provider === "vercel" && (
        <Field id="blog-project-id" label="Project ID" error={errors.projectId}>
          <input
            id="blog-project-id"
            className="text-input"
            value={blog.deploy.projectId}
            onChange={(event) => setDeploy({ projectId: event.target.value })}
          />
        </Field>
      )}

      {blog.deploy.provider !== "none" && (
        <Field
          id="blog-deploy-token"
          label="Deploy token"
          hint="Read access to deployments is enough."
        >
          <input
            id="blog-deploy-token"
            className="text-input"
            type="password"
            autoComplete="off"
            disabled={!canStoreSecrets}
            value={deployToken}
            placeholder={tokenPlaceholder(hasDeployToken)}
            onChange={(event) => setDeployToken(event.target.value)}
          />
        </Field>
      )}

      <div className="blog-form-actions">
        <button type="button" className="settings-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="settings-button settings-button-primary" disabled={saving}>
          {saving ? "Saving…" : initial.id === "" ? "Add blog" : "Save changes"}
        </button>
      </div>
    </form>
  )
}
