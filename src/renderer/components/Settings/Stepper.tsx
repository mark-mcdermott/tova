interface StepperProps {
  id: string
  value: number
  limits: { min: number; max: number }
  suffix?: string
  onChange: (value: number) => void
}

/** A bounded number field. Shared by the tabs that set sizes and counts. */
export function Stepper({ id, value, limits, suffix, onChange }: StepperProps) {
  return (
    <span className="stepper">
      <input
        id={id}
        className="text-input"
        type="number"
        min={limits.min}
        max={limits.max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix !== undefined && <span className="stepper-suffix">{suffix}</span>}
    </span>
  )
}
