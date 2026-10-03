type Props = {
  children: string
  /** What the button says while it is working. */
  busy?: string
  working?: boolean
  disabled?: boolean
}

/**
 * The one button that ends a step.
 *
 * Disabled means a neutral field colour rather than a faded accent. A
 * translucent accent reads as "the button, slightly off" and keeps its label
 * near the ink it had; this reads as inert, and the label stays legible in
 * both themes rather than going muddy in one of them.
 *
 * `busy` is a label rather than a spinner because these steps are slow for a
 * reason worth naming: scrypt runs on the device, deliberately, and takes long
 * enough to notice. A spinner would say "waiting on the network", which is the
 * wrong thing to tell somebody.
 */
export function Submit({ children, busy, working = false, disabled = false }: Props) {
  return (
    <button
      type="submit"
      disabled={working || disabled}
      className="bg-accent hover:bg-accent-bright text-accent-ink focus-visible:outline-accent mt-1 rounded-lg px-4 py-2.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-field disabled:text-ink-faint disabled:cursor-not-allowed"
    >
      {working && busy !== undefined ? busy : children}
    </button>
  )
}
