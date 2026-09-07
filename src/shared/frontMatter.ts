export type FrontMatterValue = string | string[]

export interface ParsedNote {
  data: Record<string, FrontMatterValue>
  body: string
}

const FENCE = "---"

function parseValue(raw: string): FrontMatterValue {
  const value = raw.trim()

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim()
    if (inner === "") return []
    return inner.split(",").map((item) => unquote(item.trim()))
  }

  return unquote(value)
}

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
  return quoted && value.length >= 2 ? value.slice(1, -1) : value
}

function needsQuotes(value: string): boolean {
  return value === "" || /^[[\]{}#&*!|>'"%@`]|:\s|\s$|^\s/.test(value)
}

function serializeValue(value: FrontMatterValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (needsQuotes(item) ? JSON.stringify(item) : item)).join(", ")}]`
  }
  return needsQuotes(value) ? JSON.stringify(value) : value
}

/**
 * Splits a note into its YAML front matter and body. Deliberately handles only
 * the flat `key: value` and `key: [a, b]` shapes Tova writes — anything more
 * exotic is left in the body rather than guessed at.
 */
export function parseFrontMatter(raw: string): ParsedNote {
  const normalized = raw.replace(/\r\n/g, "\n")

  if (!normalized.startsWith(`${FENCE}\n`)) {
    return { data: {}, body: normalized }
  }

  const lines = normalized.split("\n")
  const closing = lines.indexOf(FENCE, 1)
  if (closing === -1) {
    return { data: {}, body: normalized }
  }

  const data: Record<string, FrontMatterValue> = {}
  for (const line of lines.slice(1, closing)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue
    const separator = line.indexOf(":")
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    if (key === "") continue
    data[key] = parseValue(line.slice(separator + 1))
  }

  return {
    data,
    body: lines
      .slice(closing + 1)
      .join("\n")
      .replace(/^\n/, "")
  }
}

export function serializeFrontMatter(data: Record<string, FrontMatterValue>, body: string): string {
  const entries = Object.entries(data)
  if (entries.length === 0) return body

  const lines = entries.map(([key, value]) => `${key}: ${serializeValue(value)}`)
  return `${FENCE}\n${lines.join("\n")}\n${FENCE}\n\n${body}`
}
