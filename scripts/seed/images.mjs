import { execFileSync } from "node:child_process"
import { existsSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { png } from "./png.mjs"

const ink = {
  night: [30, 27, 46],
  dusk: [42, 37, 64],
  haze: [79, 93, 122],
  accent: [124, 106, 232],
  paper: [244, 242, 248]
}

const mix = (a, b, t) => a.map((channel, index) => Math.round(channel + (b[index] - channel) * t))

/*
 * Pictures rather than noise. A seeded vault gets looked at, and flat grey
 * rectangles make it hard to tell "the image failed to load" from "the image
 * is a flat grey rectangle".
 */
const drawings = {
  "gradient.png": () =>
    png(800, 500, (x, y) => [...mix(ink.night, ink.haze, (x / 800 + y / 500) / 2), 255]),

  "chart.png": () =>
    png(640, 420, (x, y) => {
      const bar = Math.floor(x / 80)
      const height = [0.35, 0.6, 0.45, 0.8, 0.55, 0.95, 0.7, 0.4][bar]
      const inside = x % 80 > 8 && x % 80 < 72 && y > 420 * (1 - height)
      return [...(inside ? mix(ink.accent, ink.paper, bar / 16) : ink.night), 255]
    }),

  "tiny.png": () => png(4, 4, (x, y) => [...((x + y) % 2 ? ink.accent : ink.paper), 255]),

  "wide-panorama.png": () =>
    png(1600, 200, (x, y) => {
      const horizon = 120 + Math.sin(x / 90) * 26
      return [...(y > horizon ? ink.night : mix(ink.haze, ink.paper, 1 - y / horizon)), 255]
    }),

  "tall-tower.png": () => png(240, 1400, (x, y) => [...mix(ink.dusk, ink.accent, y / 1400), 255]),

  // Alpha all the way to nothing at the edges, so a viewer that ignores the
  // alpha channel looks obviously wrong rather than subtly wrong.
  "transparent.png": () =>
    png(400, 400, (x, y) => {
      const dx = x / 200 - 1
      const dy = y / 200 - 1
      const distance = Math.sqrt(dx * dx + dy * dy)
      return [...ink.accent, Math.round(255 * Math.max(0, 1 - distance))]
    }),

  // A filename with a space in it: the asset URL has to be encoded to survive
  // the round trip through the custom scheme.
  "two words.png": () => png(300, 200, (x, y) => [...mix(ink.accent, ink.night, y / 200), 255]),

  // Uppercase extension. The vault stores names lowercased, but a note may
  // already reference one written this way.
  "UPPER.PNG": () => png(160, 160, (x, y) => [...((x ^ y) & 32 ? ink.paper : ink.dusk), 255])
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300">
  <rect width="480" height="300" fill="#1e1b2e"/>
  <circle cx="150" cy="150" r="78" fill="none" stroke="#7c6ae8" stroke-width="3"/>
  <circle cx="300" cy="150" r="78" fill="none" stroke="#4f5d7a" stroke-width="3"/>
  <text x="240" y="268" fill="#f4f2f8" font-family="Georgia, serif" font-size="19"
    text-anchor="middle">two things, overlapping</text>
</svg>
`

/*
 * The formats Tova accepts that cannot be written by hand in a few lines.
 *
 * Every one of these is tried through whichever converter the machine has.
 * `sips` ships with macOS but refuses webp; the others are common but not
 * assumed. A converter is only believed if a non-empty file appears — sips
 * prints a usage hint and exits 0 for a format it cannot write, so trusting
 * the exit code alone reports images that are not there.
 */
const converters = [
  (source, out) => ["sips", ["-s", "format", out.format, source, "--out", out.path]],
  (source, out) => ["magick", [source, out.path]],
  (source, out) => ["ffmpeg", ["-y", "-loglevel", "error", "-i", source, out.path]],
  (source, out) => [
    "python3",
    [
      "-c",
      "import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2])",
      source,
      out.path
    ]
  ]
]

const converted = [
  ["photo.jpg", "jpeg"],
  ["scan.gif", "gif"],
  ["modern.webp", "webp"],
  ["future.avif", "avif"]
]

function convert(source, out) {
  for (const argv of converters) {
    const [command, args] = argv(source, out)
    try {
      execFileSync(command, args, { stdio: "ignore" })
      if (statSync(out.path).size > 0) return command
    } catch {
      // Converter absent, or it cannot write this format. Try the next.
    }
  }
  return null
}

/* A zero-byte leftover from a converter that failed half way is not an image. */
const has = (path) => existsSync(path) && statSync(path).size > 0

export function writeImages(assets) {
  const written = []
  const skipped = []

  const kept = []

  for (const [name, draw] of Object.entries(drawings)) {
    if (has(join(assets, name))) kept.push(name)
    else {
      writeFileSync(join(assets, name), draw())
      written.push(name)
    }
  }

  if (has(join(assets, "diagram.svg"))) kept.push("diagram.svg")
  else {
    writeFileSync(join(assets, "diagram.svg"), svg)
    written.push("diagram.svg")
  }

  const source = join(assets, "gradient.png")
  for (const [name, format] of converted) {
    const path = join(assets, name)
    if (has(path)) {
      kept.push(name)
      continue
    }
    if (convert(source, { path, format }) === null) skipped.push(name)
    else written.push(name)
  }

  return { written, skipped, kept }
}
