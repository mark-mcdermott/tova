# Background photographs

All four are from [Unsplash](https://unsplash.com), whose licence permits free
use commercially and non-commercially without attribution. Credited anyway.

| File               | Photographer     | Source                                  |
| ------------------ | ---------------- | --------------------------------------- |
| `amber-ridges.jpg` | Daniil Silantev  | https://unsplash.com/photos/l9XWp3S9yuk |
| `dusk-sun.jpg`     | Daniel Mirlea    | https://unsplash.com/photos/HvRnuUFI3Jk |
| `rose-peaks.jpg`   | Hugo L. Casanova | https://unsplash.com/photos/ualRCC1D3YA |
| `violet-dusk.jpg`  | Darya Karaliova  | https://unsplash.com/photos/sLevNKufpBo |

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
