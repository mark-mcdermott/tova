import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useTooltip } from "./useTooltip"
import { usePreferencesStore } from "./stores/preferencesStore"
import { useTooltipStore } from "./stores/tooltipStore"
import { DEFAULT_PREFERENCES } from "../shared/preferences"

/*
 * The hook used to hand back a `title` and let the browser draw it. It hands
 * back handlers now; what they feed is in `Tooltip`.
 */
beforeEach(() => {
  vi.useFakeTimers()
  usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } })
  useTooltipStore.setState({ showing: null })
})
afterEach(() => vi.useRealTimers())

function tip(text = "New note") {
  const { result } = renderHook(() => useTooltip())
  return result.current(text)
}

/** A control with a box, which jsdom does not give one on its own. */
function control(): HTMLButtonElement {
  const button = document.createElement("button")
  button.getBoundingClientRect = () => new DOMRect(10, 20, 100, 30)
  document.body.append(button)
  return button
}

const enter = (props: ReturnType<typeof tip>, on: HTMLElement): void =>
  props.onPointerEnter?.({ currentTarget: on } as never)

const showing = () => useTooltipStore.getState().showing

describe("useTooltip", () => {
  it("gives nothing at all once hints are off", () => {
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, tooltips: false }
    })

    expect(tip()).toEqual({})
  })

  /*
   * A pointer sweeping across a toolbar would otherwise flash one under every
   * button on the way past, which is noise rather than help.
   */
  it("waits for the pointer to rest before saying anything", () => {
    enter(tip(), control())
    expect(showing()).toBeNull()

    vi.advanceTimersByTime(450)
    expect(showing()?.text).toBe("New note")
  })

  it("says nothing at all if the pointer moves on first", () => {
    const props = tip()
    enter(props, control())
    props.onPointerLeave?.()

    vi.advanceTimersByTime(2000)
    expect(showing()).toBeNull()
  })

  /* Waiting again to read the button beside the one just read is the part of
     the browser's behaviour nobody wanted. */
  it("answers straight away once one is already up", () => {
    enter(tip("First"), control())
    vi.advanceTimersByTime(450)

    enter(tip("Second"), control())
    expect(showing()?.text).toBe("Second")
  })

  it("takes it back when the pointer leaves", () => {
    const props = tip()
    enter(props, control())
    vi.advanceTimersByTime(450)

    props.onPointerLeave?.()
    expect(showing()).toBeNull()
  })

  /*
   * `title` never appeared for a keyboard at all, so this is the half the
   * browser was missing rather than a port of it.
   */
  it("appears for a keyboard without waiting", () => {
    const button = control()
    vi.spyOn(button, "matches").mockReturnValue(true)

    tip().onFocus?.({ currentTarget: button } as never)
    expect(showing()?.text).toBe("New note")
  })

  /* A tooltip over the button just pressed is in the way of whatever it did. */
  it("does not appear for a mouse click that happens to focus", () => {
    const button = control()
    vi.spyOn(button, "matches").mockReturnValue(false)

    tip().onFocus?.({ currentTarget: button } as never)
    vi.advanceTimersByTime(2000)
    expect(showing()).toBeNull()
  })

  it("measures the control it is describing", () => {
    enter(tip(), control())
    vi.advanceTimersByTime(450)

    expect(showing()?.around.left).toBe(10)
    expect(showing()?.around.width).toBe(100)
  })
})
