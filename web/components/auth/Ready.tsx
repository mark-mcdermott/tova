/**
 * Where every flow ends.
 *
 * This said there was no web editor and pointed at the desktop download, which
 * was true when it was written and stopped being true the moment `/app`
 * worked. Copy that describes what is not built has to be read again every
 * time something is.
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
        Your notes are encrypted with a key that only your devices hold — not by us, and not by
        anyone we could be asked to hand them to.
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
        href="/app"
        className="bg-accent hover:bg-accent-bright text-accent-ink rounded-lg px-4 py-2.5 text-center font-medium transition-colors"
      >
        Start writing
      </a>

      <p className="text-ink-faint text-sm leading-relaxed">
        Or{" "}
        <a
          href="https://github.com/mark-mcdermott/tova/releases/latest"
          className="text-accent hover:text-accent-bright underline"
        >
          download Tova for macOS
        </a>
        , which is the same notes with a window around them.
      </p>
    </div>
  )
}
