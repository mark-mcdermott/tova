import { describe, it, expect } from "vitest"
import { KnownPost, LocalPost, RemotePost, planSync } from "./syncPlan"

const remote = (filename: string, sha: string): RemotePost => ({ filename, sha })
const local = (filename: string, hash: string): LocalPost => ({ filename, hash })
const known = (remoteSha: string, localHash: string): KnownPost => ({ remoteSha, localHash })

function actionFor(
  remotePosts: RemotePost[],
  localPosts: LocalPost[],
  history: Record<string, KnownPost> = {}
) {
  return planSync(remotePosts, localPosts, history)[0]?.action
}

describe("planSync", () => {
  it("imports a post that only exists on the blog", () => {
    expect(actionFor([remote("a.md", "sha1")], [])).toBe("import")
  })

  it("leaves a post alone when neither side has moved", () => {
    expect(
      actionFor([remote("a.md", "sha1")], [local("a.md", "hash1")], {
        "a.md": known("sha1", "hash1")
      })
    ).toBe("unchanged")
  })

  it("takes the blog's copy when only the blog changed", () => {
    expect(
      actionFor([remote("a.md", "sha2")], [local("a.md", "hash1")], {
        "a.md": known("sha1", "hash1")
      })
    ).toBe("update")
  })

  it("publishes when only the local copy changed", () => {
    expect(
      actionFor([remote("a.md", "sha1")], [local("a.md", "hash2")], {
        "a.md": known("sha1", "hash1")
      })
    ).toBe("publishLocal")
  })

  it("refuses to pick a winner when both changed", () => {
    expect(
      actionFor([remote("a.md", "sha2")], [local("a.md", "hash2")], {
        "a.md": known("sha1", "hash1")
      })
    ).toBe("conflict")
  })

  it("calls a post removed remotely only if it had been seen there", () => {
    expect(actionFor([], [local("a.md", "hash1")], { "a.md": known("sha1", "hash1") })).toBe(
      "removedRemotely"
    )
  })

  it("treats a local draft that was never on the blog as one to publish", () => {
    expect(actionFor([], [local("draft.md", "hash1")])).toBe("publishLocal")
  })

  it("will not assume about a post on both sides with no sync on record", () => {
    expect(actionFor([remote("a.md", "sha1")], [local("a.md", "hash1")])).toBe("conflict")
  })

  it("plans every post it can see, in a stable order", () => {
    const plan = planSync([remote("b.md", "s"), remote("a.md", "s")], [local("c.md", "h")], {})
    expect(plan.map((entry) => entry.filename)).toEqual(["a.md", "b.md", "c.md"])
  })
})
