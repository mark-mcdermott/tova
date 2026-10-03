import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { startDesktopSync } from "./sync/start"
import "./styles/globals.css"

// The background is applied by App once preferences are loaded, so a chosen
// one is never overwritten by a shuffle a frame earlier.

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

/*
 * Sync is started here rather than inside `App`, which both backends mount —
 * started there it would start twice on the web, once here and once in
 * `Shell.tsx`. This file is the desktop's alone.
 *
 * It does nothing until somebody signs in on this Mac, which is the state the
 * app has always been in and is not a failure. Nothing is awaited: a vault
 * opens at the speed of a folder, and a network call is not something to hold
 * it up for.
 */
void startDesktopSync()
