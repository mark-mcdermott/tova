/**
 * The two reasons a bridge method does nothing on the web, kept apart.
 *
 * They read the same to a stack trace and mean opposite things to whoever is
 * deciding what to build next, so a single "not implemented" would lose the
 * only information in the failure.
 */

export class NotOnTheWeb extends Error {
  constructor(
    readonly method: string,
    readonly because: "unavailable" | "not yet"
  ) {
    super(
      because === "unavailable"
        ? `${method} is a thing the desktop can do and a browser cannot`
        : `${method} is not built on the web yet`
    )
    this.name = "NotOnTheWeb"
  }
}

/**
 * A browser is never going to do this.
 *
 * Opening Finder, relaunching the app, picking a folder to keep a vault in,
 * reading the macOS account picture. Not a gap to close — a thing that has no
 * meaning here, and a screen offering it is a screen telling a lie.
 */
export function unavailable<Args extends unknown[], Result>(
  method: string
): (...args: Args) => Promise<Result> {
  return () => Promise.reject(new NotOnTheWeb(method, "unavailable"))
}

/** It will exist and it does not yet. The difference is the roadmap. */
export function notYet<Args extends unknown[], Result>(
  method: string
): (...args: Args) => Promise<Result> {
  return () => Promise.reject(new NotOnTheWeb(method, "not yet"))
}
