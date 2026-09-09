# Tova — Progress

## Current state

| Phase | Status |
|-------|--------|
| 0 — Project scaffold | Complete |
| 1 — Editor core | Complete |
| 2 — File system & note management | Complete |
| 3 — Backups & data safety | Complete |
| 4 — Daily notes | Complete |
| 5 — Navigation & sidebar polish | Complete |
| 6 — Glassmorphic UI | Complete |
| 7 — Search & tags | Complete |
| 8 — Spellcheck & grammar | Spelling complete; grammar deferred |
| 9 — Blog authoring & publishing | Complete |
| 10 — Blog sync & posts sidebar | Complete |
| 11 — Blog configuration | Complete |
| 12 — Full settings panel | Complete, bar several vaults |
| 13 — Packaging | Signed `.dmg`; notarization needs Apple credentials |

**Deferred by choice, not left undone** — grammar checking and several vaults. All are in the README's roadmap with the reason
each was set aside.

Focus mode and folder reordering were dropped outright rather than deferred.

Light, dark and system are built, each with its own background — a bright
photograph cannot carry white text however the ink is coloured, so the two
modes never share one.

`pnpm run check`, `pnpm run test` and `pnpm run build` are green. The count is
deliberately not recorded here — it went stale every phase.

Package manager is **pnpm**, pinned by the `packageManager` field.
`.npmrc` sets `node-linker=hoisted`, which electron-builder needs in Phase 13.

## How it fits together

**Main process** owns the filesystem. `vault.ts` is the single choke point that
turns renderer strings into paths and refuses anything resolving outside the
vault. `notes.ts` holds note operations, `backup.ts` snapshots and versions,
`daily.ts` handles today's note and the midnight timer. Everything reaches the
renderer through typed IPC in `ipc/`, which validates shapes before they touch
disk.

**Vault layout** — `~/Documents/Tova/`

```
notes/          loose notes and one level of folders
daily/          YYYY-MM-DD.md
trash/          soft-deleted notes, flat
.versions/      per-note history, invisible to the note listing
```

Backups live in `~/Documents/Tova Backups/` — beside the vault, never inside it.

**Front matter** carries `title`, `section`, `folder` and `deletedAt`. For a
trashed note, `section` and `folder` record where it came from, which is how
restore returns it to the right folder.

**Today's daily note** is guaranteed by three paths, not one: an explicit check
at launch, a midnight timer, and a re-check on system wake and window focus. A
timeout armed before the machine sleeps cannot be trusted to fire, so the timer
is re-armed from the current clock each time rather than relied upon. The check
runs once per date, so a note deliberately trashed does not spring back.

**Renderer** is a zustand store plus components. The editor reloads its document
on `openSeq`, which only deliberate opens bump — a save that renames the file
changes the note id without yanking the cursor.

**Menus** portal to `document.body`. The glass panels use `backdrop-filter`,
which makes them the containing block for `position: fixed` descendants; a menu
nested inside one is positioned against the panel rather than the viewport, and
focusing it scrolls the panel's clipped box sideways.

## Phase 6 assets

**Fonts are in.** `Alagambe` and `Fascinate Inline` are bundled under
`src/renderer/assets/fonts/` and offered as the note title face; the choice
lives in Settings → Appearance and resolves through `--font-script`.
`Acumin Pro` has been removed from the app entirely, and no face is loaded for
the wordmark at all.

**Alagambe is proprietary**, which is why this repo is private. Inter is under
the SIL Open Font Licence and is no obstacle. Acumin Pro — Adobe's, all rights
reserved — is no longer in the app, but its four weights remain tracked under
`branding/fonts/`, and every copy remains in git history regardless. Going
public means replacing Alagambe *and* dealing with the history; see the note at
the foot of this file.

**The wordmark is drawn, not set.** Acumin Pro Light was the mockup's choice and
was never licensed here; Inter Thin stood in for one commit before being
dropped. `Wordmark.tsx` carries the mark as outlines instead — the exact
hairline geometric form the mockup specified, with no face to license, embed or
fall back from, and nothing that can reflow on a machine that lacks the font.
The fill is `currentColor`, so its colour lives in CSS with everything else.

Two versions were tried: a Thin and an ExtraLight set a little looser. The
ExtraLight is what shipped — at the sidebar's 2.05rem the Thin's curves start
dissolving into the photograph, while the ExtraLight holds a continuous line.
The looser kerning arrives as a wider viewBox at the same height, so sizing by
height preserves the spacing exactly as drawn.

Measured, the backdrop under the wordmark carries white at **2.52:1**, short of
the 3:1 that large text wants. A `drop-shadow` holds it together —
`drop-shadow`, not `text-shadow`, because the mark is a shape now and
`text-shadow` would do nothing to it. Neither moves the ratio, which measures
flat colour rather than strokes; it is what the eye needs over a photograph.

**One background is bundled** — `lake-sunset.jpg`, the backdrop extracted from
the mockup. It is the only image measured with the luminance split the layout
relies on. `backgrounds.ts` still globs the folder and picks one per launch, so
dropping a second image back in restores the rotation with no code change. The
four Unsplash photographs were removed; the originals remain in
`branding/backgrounds/`.

**Panel tint, not the photo, carries contrast.** Measured across the four
photos, text on the bare photo bottoms out at **1.3:1** — a full-height sidebar
crosses bright sky and dark land in every one of them, so no fixed text colour
works. Light text on the dark panel needs **at least 54% opacity** to hold WCAG
AA; the panels sit at 62%, worst case 5.8:1. Treat 54% as a floor when tuning.

**The app is a light theme.** Dark text on a pale scrim, as the mockup has it.

**The editor is untouched; the sidebar is not.** Fitting the mockup's pixels
against its own backdrop gives `result = 1.00 x backdrop + 0` for the editor and
`result = 0.72 x backdrop + 42` for the sidebar. The second solves to a 28%
overlay of `#908d9d`, a mid grey-lavender.

Its direction is the reverse of how it reads: it *lifts* the shadows rather than
deepening them — a sample at (57,61,67) comes out (84,91,102), while a bright
one barely moves. The headlands behind the sidebar go hazy, not dark, and look
darker only because the editor beside them is untouched and vivid.

It also compresses the range, which moves white sidebar text from 2.1-11.8:1 on
the bare photograph to 2.4-8.1:1 under the overlay. Legibility rides entirely on text colour: white in
the sidebar and the breadcrumb row, dark ink for the prose.

**The backdrop was re-graded to lift the right headland**, which was the dark
prose's worst case. Measured the same way, that cell goes from 1.51:1 to
2.44:1, and the sidebar's white text is untouched at 2.10:1 — the left of the
frame did not change. Still short of AA; the trade below stands, with better
numbers on one side of it.

**This is a deliberate trade against contrast, chosen with the numbers known.**
Sampled in 40px cells (region averages hid the extremes), white sidebar text
runs from 11.8:1 over the dark headland down to **2.1:1** where the photograph
is brightest, and dark prose bottoms out near **1.7:1** in the same way. The
mockup has the same property; it works because its text sits over the bright
water, and Tova's scrolls anywhere.

The toolbar ink is white, `#fffeff`, matching the sidebar rather than the
mockup's slate. It sits over the darker water at the foot of the image, so this
is the strongest of the three options measured: **2.4:1 to 4.3:1**, against
1.3-2.4:1 for the mockup's slate and 2.2-4.0:1 for the dark ink before it.

If a future background is less forgiving, the lever is `--glass-bg`: a white
scrim around 48% restored better than 5:1 for dark text, and a 40% dark scrim
carries white text at 4.7:1. Both are one token.

White is set on `.sidebar` and `.editor-nav` rather than globally, so the prose
below keeps its dark ink on the same untinted backdrop.

**Superseded — the old dark treatment used `backdrop-filter: brightness()`.** A flat
tint heavy enough to be safe flattened the photograph to mud. Scaling the
backdrop instead keeps its colour and texture: `brightness(0.45)` with a 6%
tint measures 5.8:1 — identical to the 62% wash it replaced, at a tenth of the
opacity. `--glass-dim` above roughly 0.5 drops the brightest photograph below AA.

Secondary text had to be lifted to match. Tuned against the old opaque wash, the
muted greys fell to 1.7:1 once the photograph showed through. They are now set
against the brightest bundled photograph: 5.3:1 secondary, 4.6:1 muted, 3.1:1
for faint placeholder text.

**Sidebar and editor share one pane of glass**, divided by a hairline, rather
than floating as separate cards. The sidebar adds a 20% scrim over the shared
glass — it carries most of the small secondary text, so its backdrop needs to be
the more predictable of the two.

**The mockup is light; the app is currently dark.** Phase 6's goal is "looks
exactly like the mockup", so the light treatment is the primary target rather
than a variant. The mockup also predates the spec — it shows the Ideas, Journal
and Archive sections the spec explicitly cut — so follow the spec for structure
and the mockup for look.

## Settings, favourites and images

**Settings takes over the workspace column**, as the spec describes it: the
sidebar stays put, the avatar and the cog both open it, and the back arrow
returns to the note that was open. It carries the Vault, Backups and About
sections — the tabbed panel with Profile, Appearance, Blogs and Docs is still
Phase 12. Backup status finally has the UI its IPC has had since Phase 3.

**Favourites reverse a documented cut.** The star writes `favorite: true` into
front matter, and only when set, so untouched notes keep clean front matter.
`sortNotes` is the one place it affects ordering, so every list that already
sorted through it pins favourites above recency for free.

**Images live in the vault, not as links to wherever they came from.** A drop or
a paste writes the file into `assets/` under a slug of its own name, and leaves
relative markdown behind — `../assets/river.png` — so the note keeps working in
any other editor opened on the vault, and survives the vault being moved.

The renderer cannot read the vault over `file://` from its own origin, so main
serves it on a privileged `tova-asset://` scheme whose every request goes
through `resolveInVault`. Measured against a real vault: a stored image returns
200 with its own byte count, a missing one 404, and a path climbing out of the
vault 404. Only the vault resolves — a remote image stays raw markdown rather
than letting a local-first app reach for the network.

Inline rendering follows the same contract as every other construct: the picture
shows while the cursor is elsewhere, the markdown returns when the cursor moves
in. A file that has since been deleted says so in place.

## Blog authoring — the `@` format

**`@` is the authoring syntax; YAML only exists at the edges.** A note stays
readable prose while it is being written, and `shared/blogPost.ts` converts at
the two boundaries: a post imported from a repo becomes `@` fields, and a post
being published becomes Astro front matter. The two conversions are inverses,
and unknown fields pass through in both directions so a blog with its own
schema keeps working without Tova knowing about it.

A post runs from its `@blog post` header to the first of a `---` marker, the
next header, or the end of the note — so several posts in one note work without
any extra syntax.

**The filename is computed from the post, never from a stored template.** Xin
shipped `{slug}.md` as a literal filename by keeping the template around and
interpolating too late; `postFilename` derives `YY-MM-DD-slug.md` from the
fields at the moment it is asked.

**The rocket is mouse-only.** `tabIndex = -1` on the widget, because Xin let Tab
reach it and that broke indenting a list inside a post. With no blog configured
it opens Settings, which is where one will be set up.

**Blog configuration lives outside the vault, and tokens are encrypted.** Xin
kept `publish-config.json` inside the vault with the GitHub token in cleartext,
which also swept it into every backup. Tova keeps `blogs.json` in the app's own
data directory; non-secret fields sit in the clear, tokens go through
`safeStorage` against the OS keychain, and no token is ever returned to the
renderer — the listing carries `hasGithubToken` booleans instead, and publishing
reads the secret in main. Where there is no keychain, storing a token is
refused rather than quietly written in the clear.

Typing `@` on an empty line offers the configured blogs and leaves a starter
block behind, dated by the local calendar. `toIsoDate` is now the one place
that formats one, because `toISOString` rolls a late evening into tomorrow.

**Publishing pushes the file, then follows the build.** The filename is computed
from the post, the `@` block becomes Astro YAML, and the file goes to the repo
through the Contents API — with the existing SHA when there is one, which is
what makes it an update rather than a failed create. A post whose filename has
changed since it last went out has its old file deleted, so a rename does not
orphan anything on the blog. `@published` records what went out; it stays in the
note and is stripped from the YAML.

**The progress bar is optimistic, and says so.** A deploy gives almost no signal
between "queued" and "done", so the bar moves on a rolling average of this
blog's last five builds and holds at 98% rather than sitting at 100% while the
build is still running. Past twice the average it says it is taking longer than
usual instead of pretending.

**The tick means published, not in sync.** Comparing the computed filename to
the recorded one looked appealing, but it calls a post current after a body edit
and stale after a retitle — worse than not claiming. Clicking the tick
republishes in one click.

Two things Xin got wrong are avoided by construction and held by tests: the
literal `{slug}.md` filename, and Tab reaching the rocket.

**Sync pulls; it never pushes.** A post changed locally is reported, not
published — publishing is something the writer does with the rocket when a post
is ready, not something a background sync decides for them. A post changed on
both sides is a conflict: both copies are left exactly as they are and the
filename is reported. A post gone from the blog is kept locally and reported.
Nothing is deleted automatically in either direction.

`planSync` in `shared/syncPlan.ts` makes every one of those decisions with no
filesystem or network in sight, which is why the awkward cases can simply be
read. Two fingerprints per post decide it: the remote blob SHA and a hash of
the local file, both recorded at the last sync.

**An imported post records the filename it came from.** Without that, the
rocket would compute a name from the title and push a *second* file beside the
one it was imported from — a blog whose filenames predate Tova would quietly
grow duplicates.

**Posts are a section, and blogs are folders within it** — `posts/<blog>/<file>.md`.
The sidebar shows each blog as a peer of Notes, and a post's breadcrumb names
its blog rather than a generic "Posts". `writeNote` deliberately does not rename
a post on a title change the way it does a note: a post's filename is the
blog's, and renaming it here would break the mapping to the file it came from.

**`vaultRoot()` no longer caches.** It made the vault root depend on which call
happened first — a hidden global in production, and cross-test bleed besides.

**A conflict is shown, not merged.** The resolver fetches both copies and shows
a line diff — removed lines are the local copy, added lines are the blog's — with
two ways out. Tova never merges: a post is short enough that choosing a side is
honest, and a wrong automatic merge in something already published is worse than
a moment's reading.

"Take the blog's" overwrites locally and settles. "Keep mine" pushes nothing and
deliberately leaves the *local* fingerprint as it was, marking only the blog's
version as seen — so the next sync reports the post as waiting for the rocket,
which is true, because the blog is still carrying the older text. Recording the
local edit as reconciled instead would have hidden that.

**Deleting a post asks which copy.** "Delete here only" trashes it locally and
leaves the blog alone; "Delete here and on the blog" removes both. Deleting a
draft locally should never quietly unpublish it. A post also cannot be moved
between sections — its filename belongs to the blog, the way a daily note's
belongs to its date.

Phase 10 is complete.

## Packaging

`pnpm run package` produces signed `.dmg`s for arm64 and x64 in `release/`.
Signing is automatic — electron-builder finds the Developer ID in the keychain.
**Notarization is configured but has never run**: it needs an Apple ID, an
app-specific password and a team ID in the environment. Until it does,
`spctl` reports "Unnotarized Developer ID" and Gatekeeper will refuse the app
on any machine that did not build it. The hardened runtime and its two
entitlements are already on, because a notarized Electron build launches to a
blank window without them and that is a miserable thing to debug later.

**Electron moved from `dependencies` to `devDependencies`.** electron-builder
refuses to package otherwise, and it is right to: the runtime is bundled from
its own copy, so a runtime dependency would have shipped a second one.

**The app icon is generated, not `branding/logo.png`.** That file is a
marketing render — tilted in perspective, with a baked-in cream background and
its own drop shadow. macOS supplies the mask and the shadow itself and expects
square, face-on art, so at 32px the render would be an unreadable smudge. The
icon is instead drawn by `tools/icon.html` and captured by Electron at 1024px:
the app's own sunset, a low horizon, and the Alagambe `T`. Replacing it is one
file and `pnpm run icon`.

## Spelling, preferences and the settings tabs

**Spellchecking is Chromium's, not a decoration layer.** The build plan asked
for a CM6 layer and flagged Xin's timing bug; using the native checker makes
that bug impossible rather than fixed — Chromium only marks a word once it is
finished, so nothing squiggles under the cursor mid-word. What Tova adds is the
correction popup, which appears on right-click and never on its own, and the
personal dictionary is Chromium's too, surfaced under General.

Grammar checking is **not** built. It needs a new dependency and the credible
ones are large; that is a decision worth making deliberately rather than
smuggling in beside spelling. It is on the README roadmap.

**Preferences are normalised in one place.** `normalizePreferences` runs over
anything read from disk or sent by the renderer, so a hand-edited file cannot
put the app into a state its own UI could not produce — a 400px font, a backup
every zero minutes. Every value has a floor and a ceiling.

Two of them would have been decorative without more wiring, and both are wired:
the indent width reconfigures a CodeMirror compartment rather than waiting for
a restart, and the backup schedule is re-read on every tick rather than
captured when the timer was armed.

**Settings is tabbed**, and one tab is honestly partial: Vault shows the one
vault rather than managing several. It is on the roadmap; nothing is half-built
in the UI. The tip jar and feedback form from the original spec are not built either —
they need a destination Tova does not have. The GitHub issues link is.

**The sidebar's name and portrait are configurable**, so the hardcoded "Mark"
is gone. The avatar is copied into the app's data directory rather than
referenced where it was picked, because a portrait that vanishes when a folder
moves is a poor way to learn how the reference worked. The identity control now
opens the Profile tab while the cog opens Settings, so the two adjacent buttons
no longer share an accessible name.

**The divider between sidebar and editor is a rim light, not a glow.** It looks
like a glowing line in the mockup, but sampling the mockup column by column says
otherwise: a bright core about two pixels wide sitting *inside* the sidebar,
falling back to the sidebar's own tone over some five pixels, and nothing at all
spilling into the editor. What reads as a shadow on the editor side is only the
body being darker than the sidebar's 28% overlay.

Built as an inset shadow and tuned against that measurement. Aligned on the
peak, the two profiles agree within about four levels out of 255 — the two
columns either side of the core match exactly.

- **The open note's ink is the tag purple, and it does not survive the whole
  column.** `#5a61de` measures 2.02:1 over the sidebar's ground where the rows
  sit today, close to white's 2.44 — but the photograph darkens going down, and
  past about halfway it falls to **1.01:1**, which is invisible. No saturated
  purple clears that band: the best of the ones measured, `#bdb5fa`, reaches
  only 1.30. The tag under the title wears the same ink and reads because it
  sits on a light pill; a sidebar row has no pill behind it. The alternatives
  are a near-white lavender (`#f0ecff`, 2.11:1 throughout, barely purple) or
  giving the active row a pill of its own.

## Search

Bodies live on disk and the renderer never holds them, so searching them happens
in main and comes back as results rather than as text.

**The body cache is keyed by modification time, not invalidated by hand.** Every
write path would otherwise have to remember to tell the index, and the one that
forgot would return stale results silently — the worst failure a search can
have, because it looks like an answer. A `stat` is cheap next to a `read`, so a
keystroke re-reads only what actually changed.

Every term has to match, but not all in the same field: "slow writing" finds a
note titled *Slow Morning* tagged `#writing`. Only a body hit carries a snippet —
repeating the title back underneath the title says nothing. Trash is skipped: it
is a holding pen, not a place to find things.

**Results are scored, not bucketed by field.** Bucketing left every body hit
tied, so ten notes mentioning a word came back in whatever order the vault
listed them. A title typed exactly beats a title that starts with the word,
which beats the word anywhere in the title, which beats a tag, which beats a
mention in a paragraph; repeats past the first count, capped at five so length
stops being the signal; and the terms in order as a phrase are worth more than
the same words scattered. Scores from different queries are not comparable, and
ties fall back to recency so they are never arbitrary.

Titles and tags could be filtered in the renderer, which already holds them, but
splitting the rules across two processes would mean two definitions of what
counts as a match. `matchNote` is one pure function and main is its only caller.

## Theme

Only the colours move between light and dark: every space, radius and size is
shared, which is what the tokens were for.

**The accents lighten rather than invert.** A purple that holds against a pale
panel disappears against a dark one. Measured on the dark ground: text 16:1,
accents 8.7-10.3, selection 7.3 with white ink.

**Backgrounds are per theme, and dark starts with none.** Every bundled
photograph is a bright one; behind white text it is unreadable, and no ink
colour fixes that. With nothing chosen, dark falls through to the gradient the
tokens already define. Added backgrounds are copied into `userData/backgrounds`
and served over a `tova-bg://` scheme of their own — a separate scheme rather
than a path prefix on the vault's, so neither handler can be talked into
serving the other's files.

**"System" is watched only while it is chosen.** An explicit choice should not
move under the reader because the sun went down.

Note that `app.getPath("userData")` is `Application Support/Electron` for an
unpackaged dev run and `Application Support/tova` for the packaged app. Anything
poking at that directory by hand needs to know which one it is looking at.

## Sections

The sidebar's rows are configuration: which exist, what they are called, what
icon they wear, in what order, and whether they are shown at all.

**The id is the directory; the label is what the reader sees.** They are
separate on purpose — renaming a section rewrites a string and touches no
files, so no note changes its name and no id in the trash's front matter goes
stale. Adding and removing do touch the vault and go through main.

**Daily is fixed.** Its notes are one a day, named by date and created for the
reader, so a renamed or missing Daily breaks the thing that makes them. Nothing
may be moved across it either — otherwise a reorder could shove the one fixed
row. **Trash cannot be removed or hidden**, because deleted notes need
somewhere to go, but it renames and moves like anything else. **Posts is not
listed at all**: the blogs that sync into it own it.

Removing a section moves its notes to Trash and then removes the directory, the
same bargain deleting a folder makes. Main refuses to remove Daily, Trash or
Posts whatever the renderer asks for.

`Section` is a shape rather than a closed set, since which ones exist is the
reader's business. Safety did not move with it: the vault's choke point still
refuses any id that could climb a path, and `isSection` is that shape test.
Listing walks the vault's own directories rather than the configured list, so
notes in a section since removed are still found rather than quietly vanishing;
restoring one whose home is gone brings it back to Notes, because visible beats
faithful.

## Carried forward

- **The sidebar is now 17.25rem** — 276px of a 1280px window, or 21.6%, against
  the mockup's 22.2%. It was 15rem (18.8%), where a folder named
  `correspondence` truncated. The value is `--sidebar-width`; it sits in a flex
  basis rather than a `width`, which is why it is worth having a name.


- **An empty section cannot be opened**, so the "+ New note" row inside it is
  out of reach. Notes still get there: the compose control creates in Notes, and
  the editor's Move menu files a note into any of the flat sections. Only the
  in-section shortcut is unreachable while the section is empty.

- **Code highlighting and PDF export are deferred.** See the roadmap in
  `README.md` for what each needs. Focus mode and folder reordering are not
  planned.

- **Prose no longer wraps at a readable measure.** The writing area now spans
  the panel so its insets match the title's, which meant dropping the 68ch cap
  on `.cm-content`. On a 1900px window that wraps around 105 characters, above
  the 45-90 usually considered comfortable, and it grows with the window.
  `--measure` still exists and still caps the title.

- **Sidebar sections start collapsed**, Tags aside, so the sidebar opens as the
  flat list the mockup shows. Nothing is persisted, so this is every launch.

- **Sidebar collapse has no visible control.** The caret was removed to match
  the mockup, which puts an avatar there instead. `Cmd+\` and the reveal tab
  still drive it, and the store, styles and tests are intact — restoring the
  control is putting a button back, not rebuilding the feature.

- **No syntax highlighting inside code blocks.** Needs `@codemirror/language-data`
  — a new dependency with real bundle cost.
- **Export .pdf is not implemented.** The `...` menu offers Export .md only.
  A PDF needs a markdown-to-HTML renderer, which Tova does not have.
- **No Playwright.** The lifecycle tests the build plan wanted from it run in
  Vitest against a real temp filesystem instead, which needs no extra dependency.
- `TUTORIAL.md` is a frozen historical record and still shows `npm` commands.
- Blockquotes, tables and the Cmd+K link popup are specified but belong to later
  phases.

## To resume

Read `CLAUDE.md`, `docs/SPEC.md`, `docs/BUILD_PHASES.md`, and this file.

## If this repo ever goes public

Deleting a font removes it from the working tree, not from git history: every
past commit still carries the blob, and a clone gets all of them. Five font
blobs are in this history — four Acumin weights and Alagambe — totalling about
0.4 MB.

Purging Acumin alone would not achieve anything, because **Alagambe is still in
use** for note titles and is proprietary too. Going public is therefore a
replacement job before it is a deletion job: find a licensed script face, swap
`--font-script`, and only then worry about history.

When that time comes, the surer path is a fresh repository from a squashed tree
rather than a `git filter-repo` rewrite. A rewrite changes every SHA, needs a
force push, and still leaves the old objects reachable by SHA on GitHub until
they are garbage collected — while any fork or clone keeps them outright. The
history of a solo project is not worth the uncertainty.
