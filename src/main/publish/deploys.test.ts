import { describe, it, expect, beforeEach, vi } from "vitest"
import { deployStatus } from "./deploys"
import { BlogDeploy } from "../../shared/types"

const fetchMock = vi.fn()

const cloudflare: BlogDeploy = {
  provider: "cloudflare",
  accountId: "acc",
  projectName: "blog",
  projectId: ""
}

const vercel: BlogDeploy = { provider: "vercel", accountId: "", projectName: "", projectId: "prj" }

function respond(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

function cloudflareDeployment(commit: string, name: string, status: string) {
  return {
    url: "https://blog.pages.dev",
    latest_stage: { name, status },
    deployment_trigger: { metadata: { commit_hash: commit } }
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

describe("cloudflare", () => {
  it("waits when the push has not been noticed yet", async () => {
    fetchMock.mockResolvedValue(respond({ result: [] }))
    expect((await deployStatus(cloudflare, "abc", "t")).state).toBe("pending")
  })

  it("follows only the deployment carrying our commit", async () => {
    fetchMock.mockResolvedValue(
      respond({
        result: [
          cloudflareDeployment("someone-else", "deploy", "success"),
          cloudflareDeployment("abc", "build", "active")
        ]
      })
    )
    const status = await deployStatus(cloudflare, "abc", "t")

    expect(status.state).toBe("building")
    expect(status.detail).toBe("build")
  })

  it("does not call a stage done while it is still running", async () => {
    // `success` here names the stage, not its outcome.
    fetchMock.mockResolvedValue(
      respond({ result: [cloudflareDeployment("abc", "deploy", "active")] })
    )
    expect((await deployStatus(cloudflare, "abc", "t")).state).toBe("building")
  })

  it("reports success once the stage has finished", async () => {
    fetchMock.mockResolvedValue(
      respond({ result: [cloudflareDeployment("abc", "deploy", "success")] })
    )
    const status = await deployStatus(cloudflare, "abc", "t")

    expect(status.state).toBe("succeeded")
    expect(status.url).toBe("https://blog.pages.dev")
  })

  it("treats a cancelled build as a failure", async () => {
    fetchMock.mockResolvedValue(
      respond({ result: [cloudflareDeployment("abc", "build", "canceled")] })
    )
    expect((await deployStatus(cloudflare, "abc", "t")).state).toBe("failed")
  })
})

describe("vercel", () => {
  it("matches on the commit it pushed", async () => {
    fetchMock.mockResolvedValue(
      respond({
        deployments: [
          { url: "other.vercel.app", readyState: "READY", meta: { githubCommitSha: "zzz" } },
          { url: "blog.vercel.app", readyState: "READY", meta: { githubCommitSha: "abc" } }
        ]
      })
    )
    const status = await deployStatus(vercel, "abc", "t")

    expect(status.state).toBe("succeeded")
    expect(status.url).toBe("https://blog.vercel.app")
  })

  it("is still building until it is ready", async () => {
    fetchMock.mockResolvedValue(
      respond({ deployments: [{ readyState: "BUILDING", meta: { githubCommitSha: "abc" } }] })
    )
    expect((await deployStatus(vercel, "abc", "t")).state).toBe("building")
  })

  it("reports an errored deployment", async () => {
    fetchMock.mockResolvedValue(
      respond({ deployments: [{ readyState: "ERROR", meta: { githubCommitSha: "abc" } }] })
    )
    expect((await deployStatus(vercel, "abc", "t")).state).toBe("failed")
  })
})

describe("no provider", () => {
  it("is done as soon as the push lands", async () => {
    const none: BlogDeploy = { provider: "none", accountId: "", projectName: "", projectId: "" }
    expect((await deployStatus(none, "abc", "t")).state).toBe("succeeded")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
