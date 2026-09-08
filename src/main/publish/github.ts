/*
 * The GitHub Contents API, narrowed to what publishing needs: read a file's
 * SHA, write it, and delete it. Nothing here holds a token — each call is given
 * one by the caller, which reads it from the keychain and drops it again.
 */

const API = "https://api.github.com"

export interface GithubFile {
  sha: string
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "GithubError"
  }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  }
}

/** GitHub's messages are the useful part of a failure; the status alone is not. */
async function describeFailure(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    const message = (body as { message?: unknown }).message
    if (typeof message === "string" && message !== "") return message
  } catch {
    // Not JSON — fall through to the status text.
  }
  return response.statusText === "" ? `HTTP ${response.status}` : response.statusText
}

function contentsUrl(repo: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `${API}/repos/${repo}/contents/${encoded}`
}

/** Resolves to null when the file is simply not there yet. */
export async function readFileSha(
  repo: string,
  branch: string,
  path: string,
  token: string
): Promise<GithubFile | null> {
  const response = await fetch(`${contentsUrl(repo, path)}?ref=${encodeURIComponent(branch)}`, {
    headers: headers(token)
  })

  if (response.status === 404) return null
  if (!response.ok) throw new GithubError(await describeFailure(response), response.status)

  const body: unknown = await response.json()
  const sha = (body as { sha?: unknown }).sha
  if (typeof sha !== "string") throw new GithubError("GitHub returned a file with no sha", 200)
  return { sha }
}

/** Creates or updates in one call; the SHA is what makes it an update. */
export async function writeFile(
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string,
  token: string,
  sha?: string
): Promise<string> {
  const response = await fetch(contentsUrl(repo, path), {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify({
      message,
      branch,
      content: Buffer.from(content, "utf-8").toString("base64"),
      ...(sha === undefined ? {} : { sha })
    })
  })

  if (!response.ok) throw new GithubError(await describeFailure(response), response.status)

  const body: unknown = await response.json()
  const commit = (body as { commit?: { sha?: unknown } }).commit
  if (typeof commit?.sha !== "string") throw new GithubError("GitHub returned no commit", 200)
  return commit.sha
}

export async function deleteFile(
  repo: string,
  branch: string,
  path: string,
  sha: string,
  message: string,
  token: string
): Promise<void> {
  const response = await fetch(contentsUrl(repo, path), {
    method: "DELETE",
    headers: headers(token),
    body: JSON.stringify({ message, branch, sha })
  })

  // A file already gone is the state we wanted anyway.
  if (response.status === 404) return
  if (!response.ok) throw new GithubError(await describeFailure(response), response.status)
}
