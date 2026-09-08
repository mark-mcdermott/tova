import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./styles/globals.css"

// The background is applied by App once preferences are loaded, so a chosen
// one is never overwritten by a shuffle a frame earlier.

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
