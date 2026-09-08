import { describe, it, expect, beforeEach, vi } from "vitest"
import { GithubError, deleteFile, readFileSha, writeFile } from "./github"

const fetchMock = vi.fn()

function respond(status: number, body: unknown, statusText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body
  } as Response
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

describe("readFileSha", () => {
  it("returns null for a post that is not there yet", async () => {
    fetchMock.mockResolvedValue(respond(404, {}))
    expect(await readFileSha("me/blog", "main", "posts/a.md", "t")).toBeNull()
  })

  it("asks for the file on the right branch", async () => {
    fetchMock.mockResolvedValue(respond(200, { sha: "abc" }))
    await readFileSha("me/blog", "trunk", "src/posts/a.md", "t")

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.github.com/repos/me/blog/contents/src/posts/a.md?ref=trunk")
    expect(options.headers.Authorization).toBe("Bearer t")
  })

  it("carries GitHub's own message through a failure", async () => {
    fetchMock.mockResolvedValue(respond(401, { message: "Bad credentials" }))
    await expect(readFileSha("me/blog", "main", "a.md", "t")).rejects.toThrow("Bad credentials")
  })

  it("reports the status when the body says nothing useful", async () => {
    fetchMock.mockResolvedValue(respond(500, "not json", "Server Error"))
    await expect(readFileSha("me/blog", "main", "a.md", "t")).rejects.toThrow(GithubError)
  })
})

describe("writeFile", () => {
  it("creates without a sha and returns the commit", async () => {
    fetchMock.mockResolvedValue(respond(201, { commit: { sha: "commit-1" } }))
    const commit = await writeFile("me/blog", "main", "posts/a.md", "hello", "Add a.md", "t")

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(commit).toBe("commit-1")
    expect(body.sha).toBeUndefined()
    expect(Buffer.from(body.content, "base64").toString("utf-8")).toBe("hello")
    expect(body.branch).toBe("main")
  })

  it("sends the sha when replacing, which is what makes it an update", async () => {
    fetchMock.mockResolvedValue(respond(200, { commit: { sha: "commit-2" } }))
    await writeFile("me/blog", "main", "posts/a.md", "hello", "Update", "t", "old-sha")

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sha).toBe("old-sha")
  })

  it("encodes content as UTF-8, so an em dash survives the trip", async () => {
    fetchMock.mockResolvedValue(respond(201, { commit: { sha: "c" } }))
    await writeFile("me/blog", "main", "a.md", "a — b", "m", "t")

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(Buffer.from(body.content, "base64").toString("utf-8")).toBe("a — b")
  })
})

describe("deleteFile", () => {
  it("treats an already-missing file as done", async () => {
    fetchMock.mockResolvedValue(respond(404, {}))
    await expect(deleteFile("me/blog", "main", "a.md", "sha", "m", "t")).resolves.toBeUndefined()
  })

  it("raises anything else", async () => {
    fetchMock.mockResolvedValue(respond(409, { message: "Conflict" }))
    await expect(deleteFile("me/blog", "main", "a.md", "sha", "m", "t")).rejects.toThrow("Conflict")
  })
})
