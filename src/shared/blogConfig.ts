import { Blog, BlogSummary } from "./types"

export const EMPTY_BLOG: Blog = {
  id: "",
  name: "",
  sidebarLabel: "",
  siteUrl: "",
  livePostPath: "/",
  github: { repo: "", branch: "main", contentPath: "" },
  deploy: { provider: "none", accountId: "", projectName: "", projectId: "" }
}

const REPO = /^[\w.-]+\/[\w.-]+$/

/**
 * One validator for the form and the main process alike, so a blog that the
 * form accepted cannot be refused on the way to disk, or the reverse.
 * Returns a message per invalid field; an empty object means valid.
 */
export function validateBlog(blog: Blog, existing: BlogSummary[]): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = blog.name.trim()

  if (name === "") errors.name = "A blog needs a name"
  else if (/\s/.test(name)) errors.name = "The name is the @handle, so it cannot contain spaces"
  else if (existing.some((other) => other.id !== blog.id && other.name === name)) {
    errors.name = "Another blog already uses that name"
  }

  if (blog.github.repo.trim() === "") errors.repo = "Which repository holds the posts?"
  else if (!REPO.test(blog.github.repo.trim())) errors.repo = "Expected owner/repo"

  if (blog.github.branch.trim() === "") errors.branch = "Which branch should posts land on?"
  if (blog.github.contentPath.trim() === "") errors.contentPath = "Where in the repo do posts go?"

  if (blog.deploy.provider === "cloudflare") {
    if (blog.deploy.accountId.trim() === "") errors.accountId = "Cloudflare needs an account ID"
    if (blog.deploy.projectName.trim() === "")
      errors.projectName = "Cloudflare needs a project name"
  }

  if (blog.deploy.provider === "vercel" && blog.deploy.projectId.trim() === "") {
    errors.projectId = "Vercel needs a project ID"
  }

  return errors
}

/** Trimmed, with the content path normalised to a trailing slash and no leading one. */
export function normalizeBlog(blog: Blog): Blog {
  return {
    ...blog,
    name: blog.name.trim(),
    sidebarLabel: blog.sidebarLabel.trim(),
    siteUrl: blog.siteUrl.trim().replace(/\/+$/, ""),
    // Kept as `/path/` so joining it to a slug never doubles or drops a slash.
    livePostPath: `/${blog.livePostPath.trim().replace(/^\/+/, "").replace(/\/*$/, "/")}`,
    github: {
      repo: blog.github.repo.trim(),
      branch: blog.github.branch.trim(),
      contentPath: blog.github.contentPath.trim().replace(/^\/+/, "").replace(/\/*$/, "/")
    },
    deploy: {
      provider: blog.deploy.provider,
      accountId: blog.deploy.accountId.trim(),
      projectName: blog.deploy.projectName.trim(),
      projectId: blog.deploy.projectId.trim()
    }
  }
}

export function blogLabel(blog: Blog): string {
  return blog.sidebarLabel === "" ? blog.name : blog.sidebarLabel
}

/** Where a published post can be read, or null when the site URL is unknown. */
export function postUrl(blog: Blog, slug: string): string | null {
  if (blog.siteUrl === "") return null
  return `${blog.siteUrl}${blog.livePostPath}${slug}`
}
