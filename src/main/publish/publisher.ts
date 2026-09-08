import { randomUUID } from "crypto"
import { PublishRequest, PublishUpdate } from "../../shared/types"
import { PublishPhase, isOverdue, publishProgress } from "../../shared/publishProgress"
import { parsePosts, postFilename, postSlug, publishedAs, toYaml } from "../../shared/blogPost"
import { postUrl } from "../../shared/blogConfig"
import { blogSecret, findBlogByName } from "../blogs"
import { readNote } from "../notes"
import { deleteFile, readFileSha, writeFile } from "./github"
import { deployStatus } from "./deploys"
import { averageFor, remember } from "./timing"

const POLL_INTERVAL_MS = 3_000
/** Long enough for a slow build, short enough that a stuck one stops pretending. */
const GIVE_UP_MS = 15 * 60 * 1000

export type Report = (update: PublishUpdate) => void

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * One publish, start to finish: work out the file, push it, clean up after a
 * rename, then follow the deploy until it settles. Progress is reported as it
 * goes rather than returned at the end, so the toast can move.
 */
export async function publish(request: PublishRequest, report: Report): Promise<PublishUpdate> {
  const id = randomUUID()
  const startedAt = Date.now()
  let filename = ""

  const emit = (
    phase: PublishPhase,
    message: string,
    extra: Partial<PublishUpdate> = {}
  ): PublishUpdate => {
    const update: PublishUpdate = {
      id,
      request,
      phase,
      // Only the build phase moves with the clock, and that path reports
      // directly rather than through here.
      progress: publishProgress({ phase, elapsedMs: Date.now() - startedAt, averageMs: null }),
      message,
      filename,
      url: null,
      error: null,
      ...extra
    }
    report(update)
    return update
  }

  try {
    emit("preparing", "Reading the post…")

    const blog = await findBlogByName(request.blog)
    if (blog === null) throw new Error(`No blog named ${request.blog} is configured`)

    const token = await blogSecret(blog.id, "github")
    if (token === null) throw new Error(`${blog.name} has no GitHub token saved`)

    const note = await readNote(request.noteId)
    const post =
      parsePosts(note.body).find((entry) => entry.headerLine === request.headerLine) ?? null
    if (post === null) throw new Error("That post is no longer in the note")

    filename = postFilename(post)
    const path = `${blog.github.contentPath}${filename}`
    const previous = publishedAs(post)

    emit("pushing", `Pushing ${filename}…`)

    const existing = await readFileSha(blog.github.repo, blog.github.branch, path, token)
    const commit = await writeFile(
      blog.github.repo,
      blog.github.branch,
      path,
      toYaml(post),
      `${existing === null ? "Add" : "Update"} ${filename}`,
      token,
      existing?.sha
    )

    // A renamed post would otherwise leave its old file behind on the blog.
    if (previous !== null && previous !== filename) {
      const stale = await readFileSha(
        blog.github.repo,
        blog.github.branch,
        `${blog.github.contentPath}${previous}`,
        token
      )
      if (stale !== null) {
        await deleteFile(
          blog.github.repo,
          blog.github.branch,
          `${blog.github.contentPath}${previous}`,
          stale.sha,
          `Remove ${previous}, renamed to ${filename}`,
          token
        )
      }
    }

    // Known as soon as the push lands, whether or not a build is followed.
    const url = postUrl(blog, postSlug(post))

    if (blog.deploy.provider === "none") {
      return emit("published", `Pushed ${filename}`, { progress: 100, url })
    }

    const deployToken = await blogSecret(blog.id, blog.deploy.provider)
    if (deployToken === null) {
      // The push is the part that matters; following the build is a courtesy.
      return emit("published", `Pushed ${filename} — no deploy token to follow the build`, {
        progress: 100,
        url
      })
    }

    const average = await averageFor(blog.id)

    for (;;) {
      const elapsed = Date.now() - startedAt
      if (elapsed > GIVE_UP_MS) {
        throw new Error("The deploy is still running after 15 minutes; check the blog's dashboard")
      }

      const status = await deployStatus(blog.deploy, commit, deployToken)

      if (status.state === "failed") {
        throw new Error(status.detail === null ? "The deploy failed" : `Deploy ${status.detail}`)
      }

      if (status.state === "succeeded") {
        await remember(blog.id, Date.now() - startedAt)
        return emit("published", `Published ${filename}`, {
          progress: 100,
          url: url ?? status.url
        })
      }

      report({
        id,
        request,
        phase: "building",
        progress: publishProgress({ phase: "building", elapsedMs: elapsed, averageMs: average }),
        message: isOverdue(elapsed, average)
          ? "Still building — longer than this blog usually takes"
          : "Building…",
        filename,
        url: null,
        error: null
      })

      await sleep(POLL_INTERVAL_MS)
    }
  } catch (error) {
    return emit("failed", "Publish failed", { error: describe(error), progress: 15 })
  }
}
