import { DEFAULT_SECTIONS, SectionConfig, normalizeSections } from "./sections"

/**
 * The face note titles are set in. The two bundled ids, or the filename of a
 * face the reader added — which is why this is a string and not a union: the
 * set is open, and a name that no longer resolves falls back to the stack in
 * globals.css rather than failing.
 */
export type TitleFont = string

export const BUNDLED_TITLE_FONTS: { value: string; label: string }[] = [
  { value: "vibur", label: "Vibur" },
  { value: "fascinate", label: "Fascinate Inline" }
]

/** True for the bundled ids, which are served by CSS rather than from disk. */
export function isBundledTitleFont(value: string): boolean {
  return BUNDLED_TITLE_FONTS.some((font) => font.value === value)
}

/**
 * How wide the prose runs. "narrow" is the mockup's column, about 45
 * characters; "full" lets it use the pane, which is what Tova shipped with.
 */
export type ProseWidth = "narrow" | "full"

export const PROSE_WIDTHS: { value: ProseWidth; label: string; hint: string }[] = [
  { value: "narrow", label: "Narrow", hint: "Kind of poetic" },
  { value: "full", label: "Full", hint: "Uses the pane" }
]

/** What the reader chose; "system" follows the OS and can change under them. */
export type ThemeChoice = "light" | "dark" | "system"

export const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" }
]

/**
 * The next choice a single button steps to, in the order the settings list
 * shows them. The icon on that button is the mode you are on, so stepping is
 * the only thing left for it to mean.
 */
export function nextTheme(theme: ThemeChoice): ThemeChoice {
  const order = THEMES.map((option) => option.value)
  return order[(order.indexOf(theme) + 1) % order.length]
}

/** The glyph for a choice: what you are on, not what you would get next. */
export function themeIcon(theme: ThemeChoice): "sun" | "moon" | "monitor" {
  if (theme === "light") return "sun"
  return theme === "dark" ? "moon" : "monitor"
}

/** What the app is actually painting, once "system" has been resolved. */
export type Theme = "light" | "dark"

/**
 * Where the name beside the avatar comes from. Kept apart from `displayName`,
 * so a spell on the account name does not throw away what was typed.
 */
export type DisplayNameSource = "none" | "system" | "custom"

export const DISPLAY_NAMES: { value: DisplayNameSource; label: string }[] = [
  { value: "system", label: "Mac account name" },
  { value: "custom", label: "Custom" },
  { value: "none", label: "None" }
]

function isDisplayNameSource(value: unknown): value is DisplayNameSource {
  return DISPLAY_NAMES.some((option) => option.value === value)
}

/**
 * Which face the sidebar wears. Kept apart from `avatarFile`, so choosing the
 * initials for a while does not throw away the picture that was there.
 */
export type AvatarChoice = "initials" | "tova" | "system" | "custom"

/*
 * The account picture leads: it is the one that is already a portrait of the
 * reader, so where a Mac has one it is the likeliest answer. The rest follow
 * in the order they take over from it.
 */
export const AVATARS: { value: AvatarChoice; label: string; hint?: string }[] = [
  { value: "system", label: "Mac Account Avatar" },
  { value: "initials", label: "Initials" },
  { value: "tova", label: "Tova Robot" },
  { value: "custom", label: "Picture", hint: "One you choose" }
]

/**
 * The two faces that have to be fetched rather than drawn: the Mac account
 * picture, which lives in the directory service, and the one the reader chose,
 * which lives in the app's data directory. Neither is reachable from the
 * renderer, so both are read in main and handed over as data URLs.
 */
export interface AvatarSources {
  system: string | null
  custom: string | null
}

export const NO_AVATARS: AvatarSources = { system: null, custom: null }

/** Six hex digits, which is all the colour input can produce. */
function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}

function isAvatarChoice(value: unknown): value is AvatarChoice {
  return AVATARS.some((avatar) => avatar.value === value)
}

export interface Preferences {
  /** Where the name beside the avatar comes from. */
  displayNameSource: DisplayNameSource
  /** The name that was typed, kept whether or not it is the one in use. */
  displayName: string
  /** Which of the four the sidebar draws. */
  avatar: AvatarChoice
  /** The chosen picture, kept in the app's data directory. Null if never set. */
  avatarFile: string | null
  /**
   * What the disc behind the initials is painted. Null to take a colour from
   * the name, which is what it did before there was anywhere to say otherwise.
   */
  avatarColor: string | null
  /** Editor body size in px. */
  fontSize: number
  /** Spaces an indent inserts. */
  tabSize: number
  /** Minutes between automatic backups. */
  backupIntervalMinutes: number
  /** How many snapshots to keep before the oldest is dropped. */
  backupLimit: number
  spellcheck: boolean
  /** Hover hints on the app's controls. Labels are unaffected. */
  tooltips: boolean
  /** Whether the app looks for a newer version when it opens. */
  updates: boolean
  /**
   * Grammar checking. Off to begin with, and its dictionary is not in the
   * download: 15.6MB is fetched once, if the reader says they want it.
   */
  grammar: boolean
  /**
   * Whether Tova has asked the reader what kind of install they want. False on
   * a fresh machine and true forever after — the question is asked once, and a
   * reader who wants to change their mind does it in Settings like everything
   * else.
   */
  greeted: boolean
  theme: ThemeChoice
  /** Extra vaults the reader has added; the default is never stored. */
  vaults: string[]
  /** Which one is open, or null for the default. */
  activeVault: string | null
  /** The sidebar's sections: which exist, what they are called, in what order. */
  sections: SectionConfig[]
  /** Background filename per theme, or null to pick one at each launch. A dark
   * room wants a dark photograph; the same image rarely serves both. */
  backgroundLight: string | null
  backgroundDark: string | null
  titleFont: TitleFont
  proseWidth: ProseWidth
  /**
   * Which sidebar rows are folded open, by the key the row is drawn under.
   * Absent means shut, so a row nobody has touched takes the default its own
   * component asks for rather than one recorded here.
   */
  expanded: Record<string, boolean>
}

/*
 * Notes starts open because that is what the sidebar did before it could fold
 * at all: somebody updating into this should find their folders where they
 * left them, not hidden behind a row they have never had to click.
 */
export const DEFAULT_EXPANDED: Record<string, boolean> = { notes: true, tags: true }

export const DEFAULT_PREFERENCES: Preferences = {
  displayNameSource: "none",
  displayName: "",
  avatar: "initials",
  avatarFile: null,
  avatarColor: null,
  fontSize: 18,
  tabSize: 2,
  backupIntervalMinutes: 60,
  backupLimit: 30,
  spellcheck: true,
  tooltips: true,
  updates: true,
  greeted: false,
  grammar: false,
  theme: "system",
  vaults: [],
  activeVault: null,
  sections: DEFAULT_SECTIONS,
  // A photograph each way. Light shuffles, as it always has; dark opens on the
  // one bundled image dark enough to sit under white text.
  backgroundLight: "shuffle",
  backgroundDark: "milky-way.jpg",
  titleFont: "vibur",
  proseWidth: "narrow",
  expanded: DEFAULT_EXPANDED
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
    // Before there was anywhere to say where the name came from, a name in the
    // field was one someone had typed — even the one seeded from the account,
    // which was a copy from the moment it was written.
    displayNameSource: isDisplayNameSource(raw.displayNameSource)
      ? raw.displayNameSource
      : text(raw.displayName, "") === ""
        ? "none"
        : "custom",
    // Before the four choices existed a picture was the only thing a file could
    // mean, so a file left over from then is the one being used.
    avatar: isAvatarChoice(raw.avatar)
      ? raw.avatar
      : typeof raw.avatarFile === "string"
        ? "custom"
        : "initials",
    avatarFile: typeof raw.avatarFile === "string" ? raw.avatarFile : null,
    avatarColor: isHexColor(raw.avatarColor) ? raw.avatarColor.toLowerCase() : null,
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
    tooltips: typeof raw.tooltips === "boolean" ? raw.tooltips : true,
    updates: typeof raw.updates === "boolean" ? raw.updates : true,
    greeted: raw.greeted === true,
    grammar: raw.grammar === true,
    vaults: Array.isArray(raw.vaults)
      ? raw.vaults.filter((path): path is string => typeof path === "string")
      : [],
    activeVault: typeof raw.activeVault === "string" ? raw.activeVault : null,
    sections: normalizeSections(raw.sections),
    theme: THEMES.some((theme) => theme.value === raw.theme)
      ? (raw.theme as ThemeChoice)
      : DEFAULT_PREFERENCES.theme,
    // `background` was the single choice before there were two. A file written
    // by an older build still names the light one.
    backgroundLight:
      typeof raw.backgroundLight === "string"
        ? raw.backgroundLight
        : typeof raw.background === "string"
          ? raw.background
          : null,
    backgroundDark: typeof raw.backgroundDark === "string" ? raw.backgroundDark : null,
    // Any non-empty string: a bundled id, or the filename of an added face.
    // "alagambe" arrives here from an older preferences file and is not one of
    // ours any more, so it lands on the default like any other stale name.
    titleFont:
      typeof raw.titleFont === "string" &&
      raw.titleFont.trim() !== "" &&
      raw.titleFont !== "alagambe"
        ? raw.titleFont
        : DEFAULT_PREFERENCES.titleFont,
    proseWidth: raw.proseWidth === "full" ? "full" : DEFAULT_PREFERENCES.proseWidth,
    expanded: readExpanded(raw.expanded)
  }
}

/*
 * Only the booleans, and only under keys a row could be drawn under.
 *
 * What is on disk here is a map somebody could have hand-edited, and it is read
 * straight into what the sidebar folds — so anything that is not a plain
 * true-or-false under a plain key is dropped rather than carried.
 */
function readExpanded(raw: unknown): Record<string, boolean> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_EXPANDED }

  const found: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key !== "" && typeof value === "boolean") found[key] = value
  }
  return found
}

export const PREFERENCE_LIMITS = LIMITS
