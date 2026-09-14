import { crc32, deflateSync } from "node:zlib"

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, "ascii")
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length)
  return out
}

/**
 * An 8-bit RGBA PNG, painted a pixel at a time.
 *
 * Hand-rolled rather than pulled from a package: the seed has to run from a
 * bare checkout, and a real encoder is three chunks and a CRC.
 *
 * @param paint receives x and y and returns `[r, g, b, a]`, each 0-255.
 */
export function png(width, height, paint) {
  // One filter byte per scanline, then four bytes a pixel. Filter 0 is "none",
  // which costs a little size and saves reimplementing the other four.
  const raw = Buffer.alloc(height * (1 + width * 4))
  let at = 0

  for (let y = 0; y < height; y++) {
    raw[at++] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y)
      raw[at++] = r
      raw[at++] = g
      raw[at++] = b
      raw[at++] = a
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ])
}
