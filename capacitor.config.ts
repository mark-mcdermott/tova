import type { CapacitorConfig } from "@capacitor/cli"

/**
 * The native shell.
 *
 * `webDir` is a build, not a URL: the app it opens is on the device, so it
 * opens with no network and stays Tova's local-first bargain rather than a
 * browser pointed at tova.so. That is also what keeps it on the right side of
 * Apple's 4.2, which refuses a wrapper around a website.
 */
const config: CapacitorConfig = {
  appId: "so.tova.app",
  appName: "Tova",
  webDir: "out/mobile"
}

export default config
