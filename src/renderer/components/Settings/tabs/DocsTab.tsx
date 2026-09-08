import { useState } from "react"

interface Doc {
  title: string
  body: string[]
}

/*
 * Written here rather than fetched: the app is local-first, and documentation
 * that needs a network to read would be the one part of Tova that does.
 */
const DOCS: Doc[] = [
  {
    title: "Getting started",
    body: [
      "Every note is a plain markdown file in ~/Documents/Tova. Nothing else is needed to read them — any editor will do, and moving the folder moves everything.",
      "Tova opens on today's daily note. The compose button at the top of the sidebar starts a new note in Notes; each section's own “+ New note” starts one there.",
      "Formatting renders as you write. Syntax markers show while the cursor is inside a construct and hide once it leaves, so the raw markdown is always one click away."
    ]
  },
  {
    title: "Daily notes",
    body: [
      "One note per day, named for the date, created at launch and again at midnight. A note left blank is swept up rather than accumulating.",
      "The check runs on waking and on focus as well as on a timer, because a timeout set before the machine sleeps cannot be relied on to fire."
    ]
  },
  {
    title: "Tags",
    body: [
      "Write #tag anywhere in a note. A line of nothing but tags reads as a header strip and stays as pills; a tag inside a sentence becomes one when the cursor is elsewhere.",
      "The sidebar's TAGS section counts every tag in the vault. Trashed notes are not counted."
    ]
  },
  {
    title: "Images",
    body: [
      "Drop or paste an image into a note. It is copied into the vault's assets folder and left as relative markdown, so the note still works in any other editor and survives the vault being moved.",
      "Only images in the vault are rendered. A remote image stays as markdown rather than having a local-first app reach for the network."
    ]
  },
  {
    title: "Blog publishing",
    body: [
      "Add a blog under Settings → Blogs: its repository, branch and content path, and a GitHub token. The token is encrypted with your keychain and never written into the vault.",
      "Type @ on an empty line to insert a post block. @title, @date, @tags and @slug become the post's front matter; anything else you write as @field passes through untouched.",
      "The rocket at the end of the header publishes. Tova computes the filename from the post itself — YY-MM-DD-slug.md — pushes it, and follows the deploy if the blog has one configured.",
      "A renamed post has its old file removed rather than left behind, because Tova records what each post last went out as."
    ]
  },
  {
    title: "Syncing a blog",
    body: [
      "Sync pulls posts down into a folder for that blog. It never pushes: a post you have edited is reported as waiting, and the rocket sends it when you are ready.",
      "A post changed here and on the blog is a conflict. Tova shows both copies as a diff and asks; it will not merge them for you.",
      "Deleting a synced post asks whether the blog's copy should go too. Nothing is ever deleted on both sides without being asked."
    ]
  },
  {
    title: "Backups",
    body: [
      "The vault is snapshotted at launch and on the schedule in General. Snapshots live beside the vault, never inside it.",
      "Restoring replaces the current vault, and backs it up first — a restore is never the end of the line. If Tova ever opens to an empty vault with backups present, it says so rather than letting you write over the gap."
    ]
  }
]

export function DocsTab() {
  const [query, setQuery] = useState("")

  const needle = query.trim().toLowerCase()
  const matches =
    needle === ""
      ? DOCS
      : DOCS.filter(
          (doc) =>
            doc.title.toLowerCase().includes(needle) ||
            doc.body.some((paragraph) => paragraph.toLowerCase().includes(needle))
        )

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Docs</h2>

      <input
        className="text-input"
        type="search"
        value={query}
        placeholder="Search the docs"
        aria-label="Search the docs"
        onChange={(event) => setQuery(event.target.value)}
      />

      {matches.length === 0 ? (
        <p className="settings-empty">Nothing here mentions that.</p>
      ) : (
        matches.map((doc) => (
          <article key={doc.title} className="doc">
            <h3 className="settings-subheading">{doc.title}</h3>
            {doc.body.map((paragraph, index) => (
              <p key={index} className="settings-note">
                {paragraph}
              </p>
            ))}
          </article>
        ))
      )}
    </section>
  )
}
