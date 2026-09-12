import { describe, it, expect, beforeEach } from "vitest"
import { loadTauriBridge } from "./testing/tauriBridge"

/*
 * Right-clicking a misspelled word.
 *
 * Tova draws its own spelling menu, and WKWebView draws one too unless the
 * event is cancelled — so both appeared, the system's on top of Tova's, and
 * dismissing the system one revealed the other underneath.
 *
 * Cancelling has to happen while the event is still being handled. The bridge
 * asks the backend which word was clicked, and that answer arrives a turn
 * later, by which time the system menu is already open. So the cancel comes
 * first and unconditionally, which is also what Electron did: it drew no
 * context menu of its own.
 */
function rightClick(target: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe("the context menu", () => {
  let runtime: ReturnType<typeof loadTauriBridge>

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="cm-content"><div class="cm-line" id="line">teh quick bwron fox</div></div>
      <input id="field" value="a title" />
    `
    runtime = loadTauriBridge()
  })

  it("does not let the system open its own over the top of ours", () => {
    expect(rightClick(document.getElementById("line")!).defaultPrevented).toBe(true)
  })

  /*
   * The failure itself: cancelling from inside the `.then` reads the same and
   * is too late, because the event has returned and the system menu is up. A
   * backend that never answers is the clearest way to say so.
   */
  it("cancels without waiting to hear whether the word is misspelled", () => {
    runtime.invoke.mockReturnValue(new Promise(() => {}))

    expect(rightClick(document.getElementById("line")!).defaultPrevented).toBe(true)
  })

  it("cancels everywhere, the way Electron drew no menu anywhere", () => {
    expect(rightClick(document.getElementById("field")!).defaultPrevented).toBe(true)
    expect(rightClick(document.body).defaultPrevented).toBe(true)
  })
})
