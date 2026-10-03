import { useEffect, useState } from "react"
import App from "../../../src/renderer/App"
import { installBridge } from "../../lib/bridge"
import { startIfPossible } from "../../lib/startup"
import "../../../src/renderer/styles/globals.css"

/**
 * The desktop's UI, in a browser.
 *
 * `App` is the renderer's own root, imported unchanged — no fork, no second
 * copy, no props it does not already take. That is what `window.tova` being
 * the only interface buys, and it is the whole bet `docs/SYNC.md` has been
 * making since it was written.
 *
 * The bridge is installed before `App` renders rather than in an effect. Its
 * stores reach for `window.tova` as they load, and an effect runs after that —
 * which is the difference between a working app and a screenful of "cannot
 * read properties of undefined".
 */
export function Shell() {
  // `useState` with an initialiser, because it runs during the first render
  // and exactly once. An effect is too late and a bare call is every render.
  const [signals] = useState(installBridge)

  /*
   * Sync starts in an effect, which is the right place for it: it reaches the
   * network and the key store, and neither belongs in a render. The bridge
   * above does not — the renderer's stores read `window.tova` as they load, and
   * an effect runs after that.
   */
  useEffect(() => {
    let stop: (() => void) | null = null
    let gone = false

    void startIfPossible(signals.localChanged, signals.vaultChanged).then((started) => {
      if (started.state !== "syncing") return
      // Unmounted while that was resolving. Stopping it now rather than
      // leaving a timer running against a tab nobody is looking at.
      if (gone) started.runner.stop()
      else stop = started.runner.stop
    })

    return () => {
      gone = true
      stop?.()
    }
  }, [signals])

  return <App />
}
