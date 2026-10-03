/**
 * Where every flow ends, for now.
 *
 * There is no web editor yet — the vault, the keys and the two sync calls are
 * built and the client that uses them is not. Saying so is better than routing
 * somebody to a page that does not exist, and better than a fake dashboard.
 */
type Props = {
  heading: string
  /** Shown only when this device actually kept the key. */
  remembered?: boolean
  onForget?: () => void
}

export function Ready({ heading, remembered = false, onForget }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="text-ink-soft text-[15px] leading-relaxed">
        Your notes are encrypted with a key that only your devices hold. Writing on the web is the
        next thing being built; until then, the desktop app is where Tova lives.
      </p>
      {remembered && (
        <div className="border-line bg-field flex flex-col gap-3 rounded-xl border p-4">
          <p className="text-[15px] leading-relaxed">
            This device is holding your key, so it will not ask again.
          </p>
          <p className="text-ink-faint text-sm leading-relaxed">
            It is stored in a form the browser will not hand back — scripts can decrypt with it and
            cannot read it out. Forgetting is the only thing that removes it; signing out does not.
          </p>
          <button
            type="button"
            onClick={onForget}
            className="border-line hover:bg-card self-start rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          >
            Forget this device
          </button>
        </div>
      )}

      <a
        href="https://github.com/mark-mcdermott/tova/releases/latest"
        className="bg-accent hover:bg-accent-bright text-accent-ink rounded-lg px-4 py-2.5 text-center font-medium transition-colors"
      >
        Download for macOS
      </a>
    </div>
  )
}
