/**
 * Signed in, and this browser is not holding the key.
 *
 * The state worth interrupting for. Everything looks like it is working —
 * notes open, writing saves — and nothing is reaching the other devices,
 * which is indistinguishable from sync being broken until somebody notices
 * weeks of writing has not arrived.
 *
 * It happens for a reason that is nobody's mistake: the key is kept on a
 * device only if the reader asked for it to be, and signing in happens on one
 * page while the app is on another. A page load is where an unkept key goes.
 */
export function Locked() {
  return (
    <div
      role="status"
      className="bg-card border-line text-ink fixed inset-x-0 bottom-0 z-50 mx-auto mb-4 flex max-w-xl flex-col gap-3 rounded-xl border p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-[15px] leading-relaxed">
        <strong className="font-medium">Not syncing.</strong> This browser is not holding your key,
        so your notes are staying here.
      </p>
      <a
        href="/signin"
        className="bg-accent hover:bg-accent-bright text-accent-ink shrink-0 rounded-lg px-3.5 py-2 text-center text-sm font-medium transition-colors"
      >
        Unlock this browser
      </a>
    </div>
  )
}
