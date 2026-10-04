import React from "react"
import ReactDOM from "react-dom/client"
import { Shell } from "../web/components/app/Shell"

/*
 * The native shell's entry point.
 *
 * It mounts `Shell` — the same component `/app` mounts in a browser — because
 * what Capacitor wraps is the web client, not a third copy of the app. The
 * bridge, the store, the sync and the renderer are all the ones already built
 * and already tested; this file is the twelve lines that say where they go.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>
)
