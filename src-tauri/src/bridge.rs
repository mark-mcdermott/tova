/*!
The preload's counterpart.

Electron injects `window.tova` from `src/preload`. Tauri has no preload, so the
same object is built by a script the webview runs before its own first import.
It grows a method at a time as commands land, and its shape is `src/shared/
types.ts` — which stays the contract for both backends.
*/

/// Run before the renderer's first import, the way the preload is.
pub const INIT_SCRIPT: &str = include_str!("../bridge.js");
