# Background photographs

`milky-way.jpg` is from [Unsplash](https://unsplash.com), whose licence permits
free use commercially and non-commercially without attribution. Credited anyway.

| File            | Source                                  |
| --------------- | --------------------------------------- |
| `milky-way.jpg` | https://unsplash.com/photos/LhDWW8PhPoE |

This table used to list four other Unsplash images — `amber-ridges.jpg`,
`dusk-sun.jpg`, `rose-peaks.jpg` and `violet-dusk.jpg`. None of them are in this
folder and none have been for some time, so the credits named files that were
not being used. They are gone from the table rather than left standing.

## Why this one is the dark default

Every other photograph here is a bright one, which is why dark mode opened on
the gradient for so long: white text over a bright sky is unreadable whatever
the ink is set to. This image is dark throughout. Sampled on a 32x20 grid, its
**brightest** cell still gives white text 15.98:1, and its darkest 21:1 — so
there is no part of it that the interface cannot sit on.

It is bundled at its native 1024px rather than upscaled, for the same reason
`lake-sunset.jpg` is: the extra pixels would carry no detail.

`lake-sunset.jpg` is not from Unsplash — it is the backdrop from the design
mockup in `branding/`, extracted by hand, and since re-graded to lift the right
headland. It is the only bundled image with the luminance split the mockup's
layout depends on: its sidebar region is markedly darker than its editor
region, which is what lets the layout carry white text on the left and
near-black on the right at the same time.

Measured in 40px cells at a 1280x800 window, the re-graded version takes dark
prose over its worst cell from **1.51:1 to 2.44:1** while leaving the sidebar's
white text where it was (2.10:1). The right headland was the dark prose's worst
case, and that is the part that changed. Neither figure clears AA — see
`PROGRESS.md` on why the panels carry no scrim.

Source: `branding/backgrounds/background-lighter.png`, outside the repository. It is 1402px wide and is
bundled at that size rather than upscaled; the image is blurred far past the
point where the extra pixels would show.

Originals are kept outside the repository, in the parent directory's
`branding/backgrounds/`. Regenerate the
bundled copies with:

```
magick <original> -resize 2560x -strip -interlace Plane \
  -sampling-factor 4:4:4 -quality 90 <destination>
```

4:4:4 rather than 4:2:0 — these are mostly smooth sky gradients, which is the
worst case for chroma subsampling and shows as banding.

Adding a photograph here is all that is needed to put it in the rotation;
`backgrounds.ts` globs this folder.
