# Home artwork

Drop the hero image here as `hero.jpg` — or `.png`, or `.webp`. It is picked up
by name, so nothing needs importing or registering. Until there is one, the
home page shows the brand's night gradient and its words, which is a deliberate
state rather than a broken one: importing a file that does not exist is a build
error, and this is a page that should be able to wait for its picture.

## No words in the picture

The page draws the wordmark and both lines itself. Type in the image would be
a second copy of them — and one that cannot take the theme, cannot be read
aloud, cannot reflow, and gets cropped (see below) at the window sizes where
it happens to fall outside the frame.

## Shape and size

It is drawn `object-fit: cover` behind the words: scaled until it fills the
pane, then cropped. **The pane is taller than a banner**, so a wide image
loses its sides rather than its top.

A 730×392 banner in a 1345×915 window loses 37% of its width, and is being
enlarged 4.7× from its real pixels once the display doubles it.

- **Around 2560×1920** (4:3), which covers a maximised window on a Retina
  display without being enlarged.
- **Squarer than a banner.** The pane is about 1.2:1 and changes as the window
  is resized, so anything much wider than 4:3 gets its edges taken.
- **Keep the subject central.** Assume the outer ~15% on every side may not be
  there.
- **Dark where the words sit** — top-left and bottom-right. Each line carries
  its own shadow, but a shadow is not a background.

JPEG at quality 80 lands around 300–600KB at that size, which is nothing beside
the 15MB the grammar checker already contributes to the download.
