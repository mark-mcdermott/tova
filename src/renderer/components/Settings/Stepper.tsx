import { useState } from "react"

interface StepperProps {
  id: string
  value: number
  limits: { min: number; max: number }
  suffix?: string
  onChange: (value: number) => void
}

/**
 * A bounded number field.
 *
 * The bound is why this holds a draft. Preferences clamp on the way in, so a
 * field wired straight to the store clamped every keystroke: with a minimum of
 * 12, selecting 18 and typing "2" became 12 before the "0" could be typed, and
 * 20 was unreachable by typing at all. What the reader saw was a number that
 * changed to something they had not typed.
 *
 * So a value inside the bounds commits as you type — which keeps the spinner
 * arrows immediate — and one outside them is held as text until you leave the
 * field, at which point it is clamped. Half-typed numbers are allowed to exist.
 */
export function Stepper({ id, value, limits, suffix, onChange }: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null)

  function type(raw: string) {
    const parsed = Number(raw)

    // Empty, mid-typing, or out of bounds: hold it and wait.
    if (raw.trim() === "" || !Number.isFinite(parsed) || parsed < limits.min) {
      setDraft(raw)
      return
    }

    if (parsed > limits.max) {
      setDraft(raw)
      return
    }

    setDraft(null)
    onChange(Math.round(parsed))
  }

  function commit() {
    if (draft === null) return
    setDraft(null)

    // Nothing usable was typed, so the field goes back to what it was rather
    // than inventing a number.
    const parsed = Number(draft)
    if (draft.trim() === "" || !Number.isFinite(parsed)) return

    onChange(Math.min(Math.max(Math.round(parsed), limits.min), limits.max))
  }

  return (
    <span className="stepper">
      <input
        id={id}
        className="text-input"
        type="number"
        min={limits.min}
        max={limits.max}
        value={draft ?? String(value)}
        onChange={(event) => type(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      {suffix !== undefined && <span className="stepper-suffix">{suffix}</span>}
    </span>
  )
}
