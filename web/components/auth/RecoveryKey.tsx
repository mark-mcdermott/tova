import { useState } from "react"

type Props = {
  recoveryKey: string
  /** Enabled only once the acknowledgement is ticked. */
  onDone: () => void
  done: string
}

/**
 * The recovery key, shown once.
 *
 * Once is not a design choice. The key is 24 random characters sealed under
 * nothing — there is no envelope to open with a password and no derivation to
 * repeat, so nothing on any machine can produce it again. Every other screen in
 * the product could be added in a later release; this one could not.
 *
 * The acknowledgement genuinely blocks. Somebody who can click past it has an
 * account whose recovery key they never saved, which is the exact trap the
 * "lost your recovery key" screen exists to tell them nothing can be done
 * about.
 */
export function RecoveryKey({ recoveryKey, onDone, done }: Props) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(recoveryKey)
    setCopied(true)
  }

  const download = (): void => {
    /*
     * Built here rather than fetched: the key has never been on the server and
     * asking it for a file would be the one request that put it there.
     */
    const file = new Blob([`Tova recovery key\n\n${recoveryKey}\n`], { type: "text/plain" })
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")
    link.href = url
    link.download = "tova-recovery-key.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Save your recovery key</h1>
        <p className="text-ink-soft text-[15px] leading-relaxed">
          This is the only way back into your notes if you ever reset your password. Write it down
          or keep it in a password manager.
        </p>
      </header>

      <p
        className="bg-field border-line text-ink rounded-xl border px-4 py-5 text-center font-mono text-lg tracking-[0.12em] break-all select-all"
        data-testid="recovery-key"
      >
        {recoveryKey}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="border-line hover:bg-field rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={download}
          className="border-line hover:bg-field rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
        >
          Download
        </button>
      </div>

      <p className="text-ink-faint text-sm leading-relaxed">
        We cannot show it again and we cannot recover it for you. Your notes are encrypted on your
        device, so this key is the only copy there is.
      </p>

      <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="accent-accent mt-0.5 size-4"
        />
        <span>I have saved my recovery key somewhere safe.</span>
      </label>

      <button
        type="button"
        onClick={onDone}
        disabled={!saved}
        className="bg-accent hover:bg-accent-bright text-accent-ink focus-visible:outline-accent rounded-lg px-4 py-2.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-field disabled:text-ink-faint disabled:cursor-not-allowed"
      >
        {done}
      </button>
    </div>
  )
}
