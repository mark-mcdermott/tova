import { describe, it, expect, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useTooltip } from "./useTooltip"
import { usePreferencesStore } from "./stores/preferencesStore"
import { DEFAULT_PREFERENCES } from "../shared/preferences"

beforeEach(() => {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } })
})

describe("useTooltip", () => {
  it("gives a title while hints are on", () => {
    const { result } = renderHook(() => useTooltip())
    expect(result.current("New note")).toEqual({ title: "New note" })
  })

  it("gives nothing at all once they are off", () => {
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, tooltips: false }
    })

    const { result } = renderHook(() => useTooltip())
    // Not an empty string: an empty title still suppresses the parent's.
    expect(result.current("New note")).toEqual({})
  })
})
