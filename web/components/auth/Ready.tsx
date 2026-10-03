/**
 * Where every flow ends, for now.
 *
 * There is no web editor yet — the vault, the keys and the two sync calls are
 * built and the client that uses them is not. Saying so is better than routing
 * somebody to a page that does not exist, and better than a fake dashboard.
 */
export function Ready({ heading }: { heading: string }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="text-ink-soft text-[15px] leading-relaxed">
        Your notes are encrypted with a key that only your devices hold. Writing on the web is the
        next thing being built; until then, the desktop app is where Tova lives.
      </p>
      <a
        href="https://github.com/mark-mcdermott/tova/releases/latest"
        className="bg-accent hover:bg-accent-bright text-accent-ink rounded-lg px-4 py-2.5 text-center font-medium transition-colors"
      >
        Download for macOS
      </a>
    </div>
  )
}
