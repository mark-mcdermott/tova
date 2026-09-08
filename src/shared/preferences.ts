/** The face note titles are set in. Both are bundled; the choice is the user's. */
export type TitleFont = "alagambe" | "fascinate"

export const TITLE_FONTS: { value: TitleFont; label: string }[] = [
  { value: "alagambe", label: "Alagambe" },
  { value: "fascinate", label: "Fascinate Inline" }
]

/**
 * How wide the prose runs. "narrow" is the mockup's column, about 45
 * characters; "full" lets it use the pane, which is what Tova shipped with.
 */
export type ProseWidth = "narrow" | "full"

export const PROSE_WIDTHS: { value: ProseWidth; label: string; hint: string }[] = [
  { value: "narrow", label: "Narrow", hint: "Kind of poetic" },
  { value: "full", label: "Full", hint: "Uses the pane" }
]

export interface Preferences {
  /** Shown beside the avatar in the sidebar footer. */
  displayName: string
  /** Avatar file kept in the app's data directory, or null for the bundled one. */
  avatarFile: string | null
  /** Editor body size in px. */
  fontSize: number
  /** Spaces an indent inserts. */
  tabSize: number
  /** Minutes between automatic backups. */
  backupIntervalMinutes: number
  /** How many snapshots to keep before the oldest is dropped. */
  backupLimit: number
  spellcheck: boolean
  /** Bundled background filename, or null to pick one at each launch. */
  background: string | null
  titleFont: TitleFont
  proseWidth: ProseWidth
}

export const DEFAULT_PREFERENCES: Preferences = {
  displayName: "",
  avatarFile: null,
  fontSize: 18,
  tabSize: 2,
  backupIntervalMinutes: 60,
  backupLimit: 30,
  spellcheck: true,
  background: null,
  titleFont: "alagambe",
  proseWidth: "narrow"
}

const LIMITS = {
  fontSize: { min: 12, max: 24 },
  tabSize: { min: 2, max: 8 },
  backupIntervalMinutes: { min: 5, max: 24 * 60 },
  backupLimit: { min: 5, max: 200 }
} as const

function clamp(value: number, { min, max }: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.round(value), min), max)
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

/**
 * Anything read off disk or sent from the renderer goes through here, so a
 * hand-edited file or a stale key cannot put the app into a state its own UI
 * could not produce.
 */
export function normalizePreferences(value: unknown): Preferences {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_PREFERENCES }
  const raw = value as Record<string, unknown>

  return {
    displayName: text(raw.displayName, DEFAULT_PREFERENCES.displayName).slice(0, 60),
    avatarFile: typeof raw.avatarFile === "string" ? raw.avatarFile : null,
    fontSize: clamp(Number(raw.fontSize ?? DEFAULT_PREFERENCES.fontSize), LIMITS.fontSize),
    tabSize: clamp(Number(raw.tabSize ?? DEFAULT_PREFERENCES.tabSize), LIMITS.tabSize),
    backupIntervalMinutes: clamp(
      Number(raw.backupIntervalMinutes ?? DEFAULT_PREFERENCES.backupIntervalMinutes),
      LIMITS.backupIntervalMinutes
    ),
    backupLimit: clamp(
      Number(raw.backupLimit ?? DEFAULT_PREFERENCES.backupLimit),
      LIMITS.backupLimit
    ),
    spellcheck: typeof raw.spellcheck === "boolean" ? raw.spellcheck : true,
    background: typeof raw.background === "string" ? raw.background : null,
    titleFont: raw.titleFont === "fascinate" ? "fascinate" : DEFAULT_PREFERENCES.titleFont,
    proseWidth: raw.proseWidth === "full" ? "full" : DEFAULT_PREFERENCES.proseWidth
  }
}

export const PREFERENCE_LIMITS = LIMITS
