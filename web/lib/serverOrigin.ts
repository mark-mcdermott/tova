/**
 * Where Tova's server is, from wherever this copy of the client is running.
 *
 * In a browser the page came from the server, so the server is the page's own
 * origin and every call can stay relative to it.
 *
 * In the native shell the page came from the device. `capacitor://localhost`
 * is a real origin and a real secure context — IndexedDB and WebCrypto both
 * work there, which is the whole local-first half of the app — but it is not
 * an address. Nothing can be fetched from it, and Better Auth refuses it
 * outright rather than failing quietly later: `Invalid base URL:
 * capacitor://localhost` at module scope, which takes the bundle with it and
 * leaves a white screen with no console behind it.
 */

/*
 * The one place the address is written down. `astro.config.mjs` has it too, as
 * `site`, and that one is for building links into pages rather than for
 * finding the server from inside a phone.
 */
const SERVER = "https://tova.so"

/** The origin to address the server by, with no trailing slash. */
export function serverOrigin(): string {
  const { protocol, origin } = window.location
  return protocol === "http:" || protocol === "https:" ? origin : SERVER
}

/**
 * What to tell `fetch` about cookies.
 *
 * Same-origin in a browser, where the session cookie belongs to the page's own
 * site. From the native shell every call leaves this document's origin, and a
 * cross-site request sends no cookies at all unless it is asked to.
 */
export function withCookies(): RequestCredentials {
  return serverOrigin() === window.location.origin ? "same-origin" : "include"
}
