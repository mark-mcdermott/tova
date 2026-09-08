import { ReactNode } from "react"

interface FieldProps {
  id: string
  label: string
  /** Smaller detail under the label, where a field needs explaining. */
  hint?: string
  error?: string
  children: ReactNode
}

/**
 * The two-column settings row: label and its detail on the left, the control on
 * the right. Every settings form uses this rather than laying itself out.
 */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {hint !== undefined && <p className="field-hint">{hint}</p>}
      </div>

      <div className="field-control">
        {children}
        {error !== undefined && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
