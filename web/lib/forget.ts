/**
 * Forget this device, meaning all of it.
 *
 * Two stores hold something after a sync: `keyStore` holds the key and
 * `noteStore` holds the notes it opened. Clearing one is not forgetting — and
 * of the two halves, clearing only the key is the worse one, because the notes
 * in IndexedDB are **plaintext**. They have to be: they are what the reader is
 * here to see. So dropping the key alone removes the lock and leaves the
 * contents sitting there for anything that can reach this origin.
 *
 * The notes go first for the same reason. If the second step fails, what is
 * left is a key with nothing to open; the other order leaves readable notes and
 * no lock at all.
 */

import { forget as forgetKey } from "./keyStore"
import { forgetNotes } from "./noteStore"

export async function forgetThisDevice(
  notes: () => Promise<void> = forgetNotes,
  key: () => Promise<void> = forgetKey
): Promise<void> {
  await notes()
  await key()
}
