import { BlogDeploy } from "../../shared/types"

/*
 * Following a build after the push. Both providers are read-only here: Tova
 * asks which deployment carries its commit and what became of it, and never
 * triggers or cancels anything.
 */

export type DeployState = "pending" | "building" | "succeeded" | "failed"

export interface DeployStatus {
  state: DeployState
  /** The live URL, once there is one. */
  url: string | null
  detail: string | null
}

const CLOUDFLARE_DONE: Record<string, DeployState> = {
  success: "succeeded",
  failure: "failed",
  canceled: "failed"
}

const VERCEL_DONE: Record<string, DeployState> = {
  READY: "succeeded",
  ERROR: "failed",
  CANCELED: "failed"
}

async function json(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Deployment lookup failed: HTTP ${response.status}`)
  return response.json()
}

interface CloudflareDeployment {
  url?: unknown
  latest_stage?: { name?: unknown; status?: unknown }
  deployment_trigger?: { metadata?: { commit_hash?: unknown } }
}

async function cloudflareStatus(
  deploy: BlogDeploy,
  commit: string,
  token: string
): Promise<DeployStatus> {
  const body = (await json(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(deploy.accountId)}/pages/projects/${encodeURIComponent(deploy.projectName)}/deployments`,
    token
  )) as { result?: CloudflareDeployment[] }

  const match = (body.result ?? []).find(
    (entry) => entry.deployment_trigger?.metadata?.commit_hash === commit
  )
  // The push has landed but Cloudflare has not noticed it yet.
  if (match === undefined) return { state: "pending", url: null, detail: null }

  const stage = typeof match.latest_stage?.name === "string" ? match.latest_stage.name : ""
  const status = typeof match.latest_stage?.status === "string" ? match.latest_stage.status : ""
  const url = typeof match.url === "string" ? match.url : null

  // A stage is only conclusive once it has actually finished.
  const settled = status === "success" || status === "failure" || status === "canceled"
  const state = settled ? (CLOUDFLARE_DONE[status] ?? "building") : "building"

  return { state, url, detail: stage === "" ? null : stage }
}

interface VercelDeployment {
  url?: unknown
  readyState?: unknown
  meta?: { githubCommitSha?: unknown }
}

async function vercelStatus(
  deploy: BlogDeploy,
  commit: string,
  token: string
): Promise<DeployStatus> {
  const body = (await json(
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(deploy.projectId)}&limit=20`,
    token
  )) as { deployments?: VercelDeployment[] }

  const match = (body.deployments ?? []).find((entry) => entry.meta?.githubCommitSha === commit)
  if (match === undefined) return { state: "pending", url: null, detail: null }

  const readyState = typeof match.readyState === "string" ? match.readyState : ""
  const url = typeof match.url === "string" ? `https://${match.url}` : null

  return { state: VERCEL_DONE[readyState] ?? "building", url, detail: readyState || null }
}

export async function deployStatus(
  deploy: BlogDeploy,
  commit: string,
  token: string
): Promise<DeployStatus> {
  if (deploy.provider === "cloudflare") return cloudflareStatus(deploy, commit, token)
  if (deploy.provider === "vercel") return vercelStatus(deploy, commit, token)
  return { state: "succeeded", url: null, detail: null }
}
