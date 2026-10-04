/**
 * The sync that is running, whichever host started it.
 *
 * Both hosts run the cycle themselves rather than in a backend: the desktop
 * from `main.tsx`, the web from `Shell.tsx`. So a screen that wants to say
 * whether a sync is going, or hurry one along, cannot ask the bridge — there
 * is nothing on the other side of it to ask.
 *
 * This is what it asks instead. One registration, from whichever host is
 * running, and a shared screen that needs neither to know which.
 */

export interface Running {
  /** Runs one now rather than waiting for the timer. */
  now: () => Promise<void>
  stop: () => void
}

let current: Running | null = null

/**
 * Takes over from whatever was running.
 *
 * Stops the old one first. Two runners against one vault push the same note
 * twice and have the second refused as stale, which reads as a sync that keeps
 * failing rather than as two of them.
 */
export function register(running: Running): void {
  if (current !== null && current !== running) current.stop()
  current = running
}

export function unregister(): void {
  current?.stop()
  current = null
}

/** Whether one is going, for a screen that wants to say so. */
export function isRunning(): boolean {
  return current !== null
}

/** Runs one now. Resolves immediately when nothing is running. */
export async function syncNow(): Promise<void> {
  await current?.now()
}
