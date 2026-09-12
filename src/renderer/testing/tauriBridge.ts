/// <reference types="node" />
import { readFileSync } from "node:fs"
import { vi } from "vitest"

/*
 * Running src-tauri/bridge.js against a real DOM.
 *
 * Not to be confused with `stubBridge` next door, which fakes the
 * `window.tova` a component sees. This is the other direction: the actual
 * Tauri bridge, evaluated, with a fake Tauri underneath it.
 *
 * It has no types, no imports and no tests of its own — it is a string handed
 * to WKWebView at document start — and everything it does goes wrong silently
 * by nature: a listener that never fires, a promise nobody holds, a stylesheet
 * that is not there yet. So these tests load the real file and assert on what
 * an event does, rather than reading it.
 */
export const bridgeSource = readFileSync("src-tauri/bridge.js", "utf-8")

export interface TauriStub {
  invoke: ReturnType<typeof vi.fn>
  listen: ReturnType<typeof vi.fn>
  startDragging: ReturnType<typeof vi.fn>
  toggleMaximize: ReturnType<typeof vi.fn>
}

/**
 * Enough of `window.__TAURI__` for the bridge to build itself against, and
 * then run it. Returns the spies, so a test can say what the bridge asked the
 * backend to do.
 */
export function loadTauriBridge(): TauriStub {
  const stub: TauriStub = {
    invoke: vi.fn().mockResolvedValue(null),
    listen: vi.fn().mockResolvedValue(() => {}),
    startDragging: vi.fn(),
    toggleMaximize: vi.fn()
  }

  Object.defineProperty(window, "__TAURI__", {
    configurable: true,
    value: {
      core: { invoke: stub.invoke },
      event: { listen: stub.listen },
      window: {
        getCurrentWindow: () => ({
          startDragging: stub.startDragging,
          toggleMaximize: stub.toggleMaximize
        })
      }
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(bridgeSource)()
  return stub
}
