/**
 * Preferences and the last screen, in their own database.
 *
 * Separate from the notes deliberately: "forget this device" clears the notes
 * and the key, and taking somebody's theme with it would be collateral. There
 * is no writing in here — a background choice and a line width — so it does
 * not need the same treatment.
 */

import { run } from "../idb"

const DB = "tova-settings"
const STORE = "settings"

export const read = <T>(key: string): Promise<T | undefined> =>
  run<T | undefined>(DB, [STORE], "readonly", ([settings]) => settings.get(key))

export const write = async (key: string, value: unknown): Promise<void> => {
  await run(DB, [STORE], "readwrite", ([settings]) => settings.put(value, key))
}
