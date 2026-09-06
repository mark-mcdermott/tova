# Background photographs

All four are from [Unsplash](https://unsplash.com), whose licence permits free
use commercially and non-commercially without attribution. Credited anyway.

| File | Photographer | Source |
|------|--------------|--------|
| `amber-ridges.jpg` | Daniil Silantev | https://unsplash.com/photos/l9XWp3S9yuk |
| `dusk-sun.jpg` | Daniel Mirlea | https://unsplash.com/photos/HvRnuUFI3Jk |
| `rose-peaks.jpg` | Hugo L. Casanova | https://unsplash.com/photos/ualRCC1D3YA |
| `violet-dusk.jpg` | Darya Karaliova | https://unsplash.com/photos/sLevNKufpBo |

Originals are kept out of the app at `branding/backgrounds/`. Regenerate the
bundled copies with:

```
magick <original> -resize 2560x -strip -interlace Plane \
  -sampling-factor 4:4:4 -quality 90 <destination>
```

4:4:4 rather than 4:2:0 — these are mostly smooth sky gradients, which is the
worst case for chroma subsampling and shows as banding.

Adding a photograph here is all that is needed to put it in the rotation;
`backgrounds.ts` globs this folder.
