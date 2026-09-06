import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { applyBackground } from "./backgrounds"
import "./styles/globals.css"

// Before first paint, so the window never flashes the bare gradient.
applyBackground()

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
