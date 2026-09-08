import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BlogSection } from "./BlogSection"
import { useBlogsStore } from "../../stores/blogsStore"
import { stubBridge } from "../../testing/bridge"
import { EMPTY_BLOG } from "../../../shared/blogConfig"
import { BlogSummary } from "../../../shared/types"

const blog: BlogSummary = {
  ...EMPTY_BLOG,
  id: "blog-1",
  name: "markmcdermott.io",
  github: { repo: "mark-mcdermott/blog", branch: "main", contentPath: "src/content/posts/" },
  hasGithubToken: true,
  hasDeployToken: false
}

const list = vi.fn()
const save = vi.fn()
const remove = vi.fn()
const setSecret = vi.fn()
const canStoreSecrets = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  list.mockResolvedValue([blog])
  save.mockResolvedValue({ ...blog, id: "blog-1" })
  remove.mockResolvedValue(undefined)
  setSecret.mockResolvedValue(blog)
  canStoreSecrets.mockResolvedValue(true)

  window.tova = stubBridge({ blogs: { list, save, remove, setSecret, canStoreSecrets } })
  useBlogsStore.setState({ blogs: [], canStoreSecrets: true, loaded: false })
})

afterEach(cleanup)

describe("BlogSection", () => {
  it("lists a blog with its repository", async () => {
    render(<BlogSection />)
    expect(await screen.findByText("markmcdermott.io")).toBeDefined()
    expect(screen.getByText(/mark-mcdermott\/blog/)).toBeDefined()
  })

  it("says when a blog has no token to publish with", async () => {
    list.mockResolvedValue([{ ...blog, hasGithubToken: false }])
    render(<BlogSection />)
    expect(await screen.findByText(/no token/)).toBeDefined()
  })

  it("will not save a blog that fails validation", async () => {
    render(<BlogSection />)
    await userEvent.click(await screen.findByRole("button", { name: "Add blog" }))

    await userEvent.type(screen.getByLabelText("Blog name"), "two words")
    await userEvent.click(screen.getByRole("button", { name: "Add blog" }))

    expect(await screen.findByText(/@handle/)).toBeDefined()
    expect(save).not.toHaveBeenCalled()
  })

  it("saves a complete blog and its token together", async () => {
    render(<BlogSection />)
    await userEvent.click(await screen.findByRole("button", { name: "Add blog" }))

    await userEvent.type(screen.getByLabelText("Blog name"), "example.com")
    await userEvent.type(screen.getByLabelText("Repository"), "me/blog")
    await userEvent.type(screen.getByLabelText("Content path"), "src/posts/")
    await userEvent.type(screen.getByLabelText("GitHub token"), "ghp_typed_by_the_user")
    await userEvent.click(screen.getByRole("button", { name: "Add blog" }))

    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(setSecret).toHaveBeenCalledWith("blog-1", "github", "ghp_typed_by_the_user")
  })

  it("says a stored token is there without showing it", async () => {
    render(<BlogSection />)
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }))

    const field = screen.getByLabelText("GitHub token") as HTMLInputElement
    expect(field.value).toBe("")
    expect(field.placeholder).toBe("Stored — type to replace")
    expect(field.type).toBe("password")
  })

  it("asks for Cloudflare's fields only once Cloudflare is chosen", async () => {
    render(<BlogSection />)
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }))

    expect(screen.queryByLabelText("Account ID")).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText("Deploys on"), "cloudflare")
    expect(screen.getByLabelText("Account ID")).toBeDefined()
  })

  it("says a token cannot be stored when there is no keychain", async () => {
    canStoreSecrets.mockResolvedValue(false)
    render(<BlogSection />)
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }))

    expect(screen.getByLabelText("GitHub token")).toHaveProperty("disabled", true)
    expect(screen.getByText(/no keychain available/)).toBeDefined()
  })

  it("confirms before deleting, and says the live blog is untouched", async () => {
    render(<BlogSection />)
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }))

    expect(screen.getByText(/no effect on the live blog/)).toBeDefined()
    expect(remove).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith("blog-1"))
  })
})
