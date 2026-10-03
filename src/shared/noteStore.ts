/**
 * What a sync needs from a device, and nothing more.
 *
 * Two implementations are coming and they have little in common: the desktop
 * keeps notes as markdown files in a folder somebody else can open, and the web
 * keeps them in IndexedDB. Everything above this line is the same on both,
 * which is the whole reason the line is here.
 *
 * Plaintext throughout. The cycle seals on the way out and opens on the way in,
 * so a store never holds a key and never sees a ciphertext.
 */

/** A note as this device holds it. A tombstone is a note, not an absence. */
export interface StoredNote {
  id: string
  text: string
  deleted: boolean
}

/**
 * The last point this device and the server agreed about a note.
 *
 * `text` is kept because it is the base a three-way merge needs, and the only
 * other way to get one is to ask the server for a version it no longer stores.
 * It costs a second copy of every synced note; a merge without it is not a
 * merge, it is a guess.
 */
export interface AgreedNote {
  version: bigint
  text: string
  deleted: boolean
}

export interface NoteStore {
  /** Every note here, tombstones included. */
  all(): Promise<StoredNote[]>
  write(note: StoredNote): Promise<void>
  /** Everything last agreed with the server, by note id. */
  agreed(): Promise<Record<string, AgreedNote>>
  agree(id: string, agreed: AgreedNote): Promise<void>
  /** Where the last pull stopped. Zero asks for everything. */
  cursor(): Promise<bigint>
  setCursor(at: bigint): Promise<void>
}
