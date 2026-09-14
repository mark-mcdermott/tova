# Seeding a vault for QA

```sh
pnpm run seed                                  # ~/Documents/Tova
pnpm run seed -- --vault "~/Documents/Tova QA" # somewhere else
pnpm run seed -- --force                       # a vault that already holds notes
```

It only ever creates files. Nothing in here deletes or truncates a note, and it
refuses a vault that already holds notes unless you pass `--force`.

## What you get

- **`scripts/seed/vault/`** — the notes, as ordinary `.md` files in the layout
  they land in. Edit them, add to them; whatever is in here gets copied.
- **Generated on each run** — the images, the daily notes (dated relative to
  today, so the Daily section always has a today), and the files whose _bytes_
  are the test: CRLF endings, a byte order mark, a missing final newline, lines
  with nowhere to wrap, and a 200KB note.
- **`notes/empty-folder/`** — made by the script, because git will not track an
  empty directory. Clicking it should create a first note and open it.

## The tag notes

`notes/tags/` is a drill for deleting by tag. Every file says in its own prose
what should happen to it, so the exercise is: purge `ephemeral`, then read.

`keep` is the tag that must survive. `purge-drill` marks the notes taking part.

## Images

Every format the vault accepts — png, jpg, gif, webp, avif, svg — plus a
filename with a space in it, an uppercase extension, a 4×4, a 1600×200, alpha
to transparent, and a 240×1400. The PNGs are drawn by
[`seed/png.mjs`](seed/png.mjs); the rest are converted by whichever of `sips`,
`magick`, `ffmpeg` or Pillow the machine has. Any that cannot be made are named
in the summary rather than quietly missing.
