import { useId } from "react"

type Props = {
  label: string
  type: "email" | "password" | "text"
  value: string
  onChange: (value: string) => void
  /** Shown under the field, in place of the hint, when something is wrong. */
  error?: string | null
  hint?: string
  autoComplete?: string
  required?: boolean
  autoFocus?: boolean
}

/**
 * One labelled input.
 *
 * The label is a real `<label>` with a generated id rather than a placeholder:
 * a placeholder disappears the moment somebody types, which is exactly when
 * they want to check what the field was asking for.
 */
export function Field({
  label,
  type,
  value,
  onChange,
  error = null,
  hint,
  autoComplete,
  required = true,
  autoFocus = false
}: Props) {
  const id = useId()
  const note = error ?? hint
  // Only wired up when there is something to point at, so a field with neither
  // does not advertise an empty description.
  const describedBy = note === undefined || note === null ? undefined : `${id}-note`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-soft text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className="bg-field border-line focus:border-accent focus:ring-accent/25 rounded-lg border px-3 py-2.5 text-[15px] outline-none transition-colors focus:ring-4"
      />
      {note !== undefined && note !== null && (
        <p
          id={describedBy}
          className={error === null ? "text-ink-faint text-xs" : "text-danger text-xs"}
        >
          {note}
        </p>
      )}
    </div>
  )
}
