# Tova — Progress

## Current state

| Phase                             | Status                                              |
| --------------------------------- | --------------------------------------------------- |
| 0 — Project scaffold              | Complete                                            |
| 1 — Editor core                   | Complete                                            |
| 2 — File system & note management | Complete                                            |
| 3 — Backups & data safety         | Complete                                            |
| 4 — Daily notes                   | Complete                                            |
| 5 — Navigation & sidebar polish   | Complete                                            |
| 6 — Glassmorphic UI               | Complete                                            |
| 7 — Search & tags                 | Complete                                            |
| 8 — Spellcheck & grammar          | Complete                                            |
| 9 — Blog authoring & publishing   | Complete                                            |
| 10 — Blog sync & posts sidebar    | Complete                                            |
| 11 — Blog configuration           | Complete                                            |
| 12 — Full settings panel          | Complete                                            |
| 13 — Packaging                    | Signed `.dmg`; notarization needs Apple credentials |
| 14 — Tauri backend                | 67 of 74 IPC methods; the rest need a running app   |

**Deferred by choice, not left undone** — paging the snapshot list. All are in the README's roadmap with the reason
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

**Fonts are in.** `Vibur` and `Fascinate Inline` are bundled under
`src/renderer/assets/fonts/` and offered as the note title face, alongside any
face the reader adds; the choice lives in Settings → Appearance and resolves
through `--font-script`. `Acumin Pro` and `Alagambe` have both been removed from
the app, and no face is loaded for the wordmark at all.

**Every face the app ships is now OFL.** Vibur, Fascinate Inline and Noto Sans
Mono are all under the SIL Open Font Licence. Alagambe left with the app; the
four Acumin weights outlasted it in the branding directory, tracked but unused,
before being removed too. Neither is in this repository's history; see the note
at the foot of this file.

**The title face is replaceable.** Settings → Appearance takes any `.otf`,
`.ttf`, `.woff` or `.woff2` and copies it into `userData/fonts`. An added face
registers as the family `Tova Title`, which is what `--font-script` names, so
the stack stays in CSS rather than being assembled in JavaScript. A file that
will not decode never becomes the preference: it is loaded first, and the picker
says so instead of leaving the reader with a silent fallback. Each added face
also registers under a family of its own, so its chip in the picker is set in
it — choosing by eye is the only reason that picker exists.

**Added faces are data URLs, not a scheme**, though they began as one to match
the backgrounds. The renderer runs from `file://`, and Chromium refuses
cross-origin _font_ requests from there to any custom scheme; no response header
lifts it, because the blocked origin is the page's, not the font's. Images are
not fetched under CORS, which is why the backgrounds' scheme is fine and this
one never could be. `resolveTitleFont` stays as the path choke point either way.
Worth remembering that the jsdom tests were green throughout: only running the
app found it.

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

Its direction is the reverse of how it reads: it _lifts_ the shadows rather than
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
rocket would compute a name from the title and push a _second_ file beside the
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
deliberately leaves the _local_ fingerprint as it was, marking only the blog's
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

**`files` adds to electron-builder's default, it does not replace it.** The
default packs production `node_modules` whole, so the asar carried the entire
dependency tree that electron-vite had already compiled into `out/` — 104MB
around 19MB of real build output. Harper's WASM was in there three times: the
chunk the renderer actually loads, plus the slim and full models still sitting
in `node_modules/harper.js`, which nothing reads at runtime. One `!node_modules/**`
line takes the asar to 18.7MB and the bundle from 374MB to 289MB. Verified by
running the packaged app against a throwaway profile: it boots clean and grammar
still lints, which is the check that matters — grammar is the one feature that
resolves its payload lazily.

**The signed build rewrites `package.json`.** Somewhere in the signing path,
electron-builder re-serialises the manifest in place and drops `scripts`,
`keywords` and `devDependencies`. `pnpm run package --dir` does not do this. If
a packaging run leaves the file looking short, that is why — `git checkout --
package.json` and carry on. Worth watching, because it is exactly the kind of
change that gets committed by accident.

**The app icon is generated, not `branding/logo.png`.** That file is a
marketing render — tilted in perspective, with a baked-in cream background and
its own drop shadow. macOS supplies the mask and the shadow itself and expects
square, face-on art, so at 32px the render would be an unreadable smudge. The
icon is instead drawn by `tools/icon.html` and captured by Electron at 1024px:
the app's own sunset, a low horizon, and the Alagambe `T`.

That has since been replaced by supplied artwork: `tools/icon-source.png`, which
`tools/icon.html` now only places — 826px of art centred on a 1024 canvas, the
Big Sur proportion. Swapping the artwork and running `pnpm run icon` is the
whole job.

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

### Chromium hands back no suggestions for some words

Right-click a misspelling and the popup sometimes reads "No suggestions" for a
word macOS has perfectly good corrections for. `teh` is the reliable example:
Chromium marks it, reports it as the misspelled word — the popup names it — and
hands over an empty `dictionarySuggestions`. `bwron` on the same line gets a
list. The popup is doing what it is told; the list arrives empty.

It is not the vault, the packaging or the locale trim. It behaves the same in
`pnpm run dev`, and the trim removed 219 files, every one a `locale.pak` —
neither build carries a dictionary at all, because macOS supplies it.

Asked directly, macOS has the answers, and better ones than Chromium is
passing on:

| word      | `NSSpellChecker` guesses      |
| --------- | ----------------------------- |
| `teh`     | the, ten, tea, tech, feh, yeh |
| `brwon`   | brown, Bryon                  |
| `bwron`   | baron, boron, Byron           |
| `recieve` | receive, relieve              |

(`bwron` is genuinely what macOS thinks, so that one is not a bug — it is a
different transposition from `brwon` and the dictionary answers accordingly.)

The likely cause is language detection: asked about `teh` **without** naming a
language, macOS reports it as correctly spelled, and `setSpellCheckerLanguages`
is documented as a no-op on macOS. Short words are where automatic detection
has least to go on.

**Deliberately not fixed here.** Electron exposes no route to `NSSpellChecker`
for suggestions — `webFrame.setSpellCheckProvider` decides which words are
wrong, not what to offer instead — so fixing it under Electron means shipping a
word list and an edit-distance search. That work does not survive a move off
Chromium, where the suggestions have to come from our own call to the OS
regardless. The table above is the evidence that the call returns what we want:
`guesses(forWordRange:in:language:inSpellDocumentWithTag:)`, with `learnWord`
for the personal dictionary. `SpellingMenu` renders whatever it is handed, so
the renderer side needs no change either way.

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
otherwise: a bright core about two pixels wide sitting _inside_ the sidebar,
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
note titled _Slow Morning_ tagged `#writing`. Only a body hit carries a snippet —
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

**Only removal is withheld, and only from two rows.** Daily's notes are made
for the reader one a day and Trash is where deleting one puts it, so neither has
anywhere else to go. Everything else about them is the reader's: both rename,
move and hide like any other row. That works because the id is the directory —
Daily can be called anything and the scheduler still writes into `daily/`, and
hiding it stops it appearing in the rail and stops nothing else.

**Blogs are rows in the same list.** They were a hardcoded block above the
sections; now a blog can sit anywhere in the rail, and renames, moves and hides
like a section. What it cannot do is be deleted from here — that would take its
stored tokens and its sync history with it, which belongs in the Blogs tab where
the consequences are spelled out.

A blog's row is _derived, not stored_. Blogs live in the app's data directory
and preferences cannot see them, so `reconcileBlogs` brings the two together at
render time: a new blog appears at the top without anything being written, and a
deleted one takes its row with it, so no row can outlive the blog it names. Only
arranging a blog writes it down.

That also moved the blog's sidebar label. It was `sidebarLabel` in `blogs.json`;
it is the rail entry's `label` now, so there is one field and one place to edit
it rather than the same name in two Settings tabs. **Rail entries are keyed by
`railKey`, not by id** — a blog may legitimately be called "notes", and keyed by
id alone it would be the same row as the Notes section, with an edit to one
silently editing the other.

**Posts is not listed at all**: the blogs that sync into it own it.

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

## Grammar

Harper, chosen over LanguageTool because it runs on this machine. The app tells
the reader on its own Vault tab that nothing leaves it, and a hosted checker
would have made that untrue for every sentence they wrote.

**It is 15.6MB of WebAssembly, not the 1-3MB first estimated.** That number is
why the preference is off by default and why the module is imported on demand:
nothing about Harper is fetched until the reader turns it on. The `.dmg` grows
by the file either way; startup does not.

Harper is told the text is markdown, so it reads `**bold**` as emphasis rather
than as a typo — the difference between useful and unusable in this editor.

Notes are mapped through every edit rather than cleared, so an underline stays
under its own words while the writing carries on; a note whose own span is
edited is dropped rather than left pointing at the wrong sentence. The mark is
a dotted amber underline, deliberately unlike Chromium's red spelling squiggle:
a suggestion about a sentence is a softer claim than a misspelt word.

## Carried forward

- **The sidebar is now 17.25rem** — 276px of a 1280px window, or 21.6%, against
  the mockup's 22.2%. It was 15rem (18.8%), where a folder named
  `correspondence` truncated. The value is `--sidebar-width`; it sits in a flex
  basis rather than a `width`, which is why it is worth having a name.

- **The roadmap is empty.** The proprietary script face is replaced and the
  repository carries nothing licensed. Focus mode, folder reordering and a
  theme picker were dropped rather than deferred.

- **Prose wraps at a measure again**, and it is a preference. "Narrow" holds
  the column to 45 characters — measured off the mockup — and is the default;
  "Full" lets it use the pane, which is what the app shipped with for a while.
  The setting is in Appearance.

- **Sidebar sections do not unfold at all** any more. Clicking one opens its
  index page in the body instead, which is also how tags and folders behave.
  The sidebar is a rail of destinations, not a tree.

- **Sidebar collapse has no visible control.** The caret was removed to match
  the mockup, which puts an avatar there instead. `Cmd+\` and the reveal tab
  still drive it, and the store, styles and tests are intact — restoring the
  control is putting a button back, not rebuilding the feature.

- **Syntax highlighting inside code blocks is on**, through
  `@codemirror/language-data`. The grammars load per language on demand rather
  than shipping in the main bundle.
- **Export .pdf goes through Electron**, not a markdown-to-HTML dependency:
  the note renders in an offscreen window and `printToPDF` writes the file.
- **No Playwright.** The lifecycle tests the build plan wanted from it run in
  Vitest against a real temp filesystem instead, which needs no extra dependency.
- Blockquotes, tables and the Cmd+K link popup are specified but belong to later
  phases.

## Resuming notarization

Not started, and blocked outside this repository: `notarytool` returns a 403,
"a required agreement is missing or has expired", which is an Apple account
state — a membership renewal — rather than anything here.

Everything on this side is ready. The Developer ID certificate is valid to
March 2031, the hardened runtime is on, and `build/entitlements.mac.plist`
carries the two JIT allowances Chromium needs or a notarized build launches to
a blank window. No config change is needed either: in electron-builder 26 the
`mac.notarize` option means _whether to disable_ notarization, so its absence
from `electron-builder.yml` enables it. It runs as soon as credentials are in
the environment.

Team ID is `VRFF4MSHAC`. That is not a secret — it is embedded in the code
signature of every build and readable with `codesign -dv` on any copy. The
app-specific password is the secret, which is why it goes into the keychain and
only a profile _name_ reaches the environment.

```bash
xcrun notarytool store-credentials "tova" --apple-id "<your apple id>" --team-id "VRFF4MSHAC"
APPLE_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db" APPLE_KEYCHAIN_PROFILE="tova" pnpm run package
xcrun stapler validate release/Tova-<version>-arm64.dmg
```

**Verifying on the machine that built it proves almost nothing.** Gatekeeper
only challenges files carrying `com.apple.quarantine`, which is set when a file
arrives from a browser, AirDrop or mail — never on a local build. Either copy
the `.dmg` to a second Mac, or set the attribute by hand:

```bash
xattr -w com.apple.quarantine "0081;00000000;Safari;" release/Tova-<version>-arm64.dmg
```

The baseline to compare against: today `spctl -a -vvv -t install` on the built
app says `rejected`, `source=Unnotarized Developer ID`. The signature itself is
already correct — `Developer ID Application: Mark McDermott (VRFF4MSHAC)` with
`flags=0x10000(runtime)`. Notarization is the only missing piece.

## The Tauri backend

Electron is 192MB of Chromium that the app uses to draw text. The Tauri backend
is the same application against the system webview, and it exists because a
calm local-first writing tool should not cost a quarter of a gigabyte.

Measured, now that it builds: **241MB packaged under Electron, about 38MB
under Tauri** — a 19.5MB binary beside the same 19MB of renderer. Fifteen of
those renderer megabytes are the grammar checker's WebAssembly, which loads on
demand and is still packaged, so there is another two thirds to be had off the
larger half of what is left.

It is being ported a slice at a time rather than rewritten, and the rule for
the whole of it is that **the IPC surface does not move**. Every command in
`src-tauri` answers to the same name and the same shape as the Electron handler
it replaces, so both backends run against one renderer and a slice can land
without the renderer knowing which one it is talking to.
`src/main/surface.conformance.test.ts` is what holds that to account; it was
maintained by hand until it was not.

`src-tauri/bridge.js` is the progress bar. It builds `window.tova` out of Tauri
commands, and anything not yet ported throws by name rather than returning
undefined — so a gap is a loud failure in the console and not a component
rendering blank.

### Conformance, and why there is so much of it

A port is not a rewrite, and the thing that makes it one is being able to show
the two sides agree. `conformance/` holds fixtures generated from the
TypeScript and read by both backends: preferences, screens, the cipher, the
text layer a note is read and written through, search, the `@blog post` format,
publishing's arithmetic, and blog configuration.

They are generated rather than written, which matters — a fixture someone typed
records what they believed, and one generated from the code records what it
does. The difference showed up repeatedly: every divergence found in this port
was a JavaScript coercion rule rather than anything about the logic.

The ones worth knowing, because they will bite anything else ported from this
codebase:

- **`\w` and `\S` in a JavaScript regex are ASCII** without the `u` flag, and
  Rust's `regex` crate reads them as Unicode. `#café` is not a tag; `café/repo`
  is not a repository name. Every pattern here is hand-written for that reason,
  and the project carries no regex crate.
- **`\s` includes the byte-order mark and excludes U+0085**, and Rust's
  `char::is_whitespace` does exactly the opposite.
- **JavaScript string offsets are UTF-16 code units.** Search slices a body at
  an index `indexOf` produced, and the editor applies an edit at an offset the
  backend computed. Counting bytes there does not merely order things
  differently: it cuts in the wrong place, and in Rust it panics.
- **`<` on strings compares UTF-16 code units too**, so JavaScript says
  `"\u{FFFD}" < "\u{10000}"` is false and Rust says true. A note titled with
  an emoji sorts differently under each.
- **`new Date(1, 0, 1)` is 1901**, so `0001-01-01` is not a daily note.
- **NFKD is load-bearing in `slugify`**: without it `café` slugs as `caf-`, and
  every accented title gets a different filename under each backend.

`src-tauri/src/js.rs` is where those live, in one file, because each is small
and wrong in a way no test of the port against itself would show.

### Two places this deliberately differs

**`localeCompare` is gone, from both backends.** It was the tie-break in
`sortNotes` and the ordering in `listFolders`, and it could not be ported: it
is a collation rather than a comparison, and matching it means carrying ICU's
tables. Changing the TypeScript was the better trade anyway — called with no
locale, as it was, it asks the operating system, so two readers with different
locales already saw their folders in different orders.

**The daily note is checked once a minute rather than at midnight.** Electron
arms a timer for the exact distance and then carries a wake handler and a focus
handler, because a single long timeout cannot be trusted across a suspend.
Polling needs none of that, and there is no arithmetic about when midnight is —
which is the part that went wrong in Xin.

### What is left

Seven methods, and they are the ones that cannot be ported without a running
app: `notes.exportPdf`, which prints through Chromium, and the six spellcheck
methods, which are Chromium's dictionary and its context menu. Both want
Objective-C interop and a decision about how the renderer asks for suggestions
when the webview does not hand them over the way Chromium does.

The keychain is verified. `tools/safe-storage-vectors.js` and the ignored test
beside it in `src-tauri/src/safe_storage.rs` are the pair that proves Electron's
`safeStorage` and the Rust port reach the same key, and they have been run:
Rust wrapped the same string to exactly the bytes Electron did. The scheme has
no nonce, so identical output proves both directions at once.

It failed on the first attempt, and on the tool rather than the port. Run as
`electron tools/…`, `app.getName()` is "Electron", so `safeStorage` reached for
`Electron Safe Storage` — a key with nothing to do with Tova. The tool sets the
name now. If it ever fails again, check which keychain item each side actually
used before suspecting the cipher.

## To resume

Read `CLAUDE.md`, `docs/SPEC.md`, `docs/BUILD_PHASES.md`, and this file.

## Licensing, and why this history is short of one thing

**This repository was migrated.** It began as `tova-proj/`, a directory holding
the app in `tova/` alongside `branding/` — mockups, logo drafts and licensed
faces. The app is now the repository root and `branding/` lives outside it, in
the parent directory, where it never reaches git.

The migration rewrote history rather than starting fresh, so all 46 commits are
here, but three things were removed from every commit they ever appeared in:

- `branding/` entirely, including four Acumin Pro weights (Adobe's, all rights
  reserved) and `alagambe.otf`.
- `src/renderer/assets/fonts/alagambe.otf` and `acumin-pro-regular.otf`, which
  were bundled _inside_ the app in earlier commits. These were the ones that
  nearly got missed: removing `branding/` looks like it solves the problem, and
  it does not.
- `TUTORIAL.md`, retired long before the move.

**A consequence worth knowing.** Old commits reference font files that are no
longer in the tree, so checking one out and building it will not reproduce what
shipped at the time. The history is honest about what was written; it is not a
buildable archive.

**Every face here is OFL** — Vibur, Fascinate Inline, Noto Sans Mono — so there
is no licensing obstacle to this repository being public.

The original repository, with its pull requests and their reasoning, is kept
private at `mark-mcdermott/tova-bak`. It still carries the proprietary blobs in
its history and should not be made public.
