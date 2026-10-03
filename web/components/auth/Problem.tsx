/**
 * What went wrong, where the reader is looking.
 *
 * `role="alert"` so it is announced when it appears — a form that failed
 * silently for somebody using a screen reader is a form that did nothing.
 */
export function Problem({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="border-danger/35 bg-danger/8 text-danger rounded-lg border px-3 py-2.5 text-sm"
    >
      {children}
    </p>
  )
}
