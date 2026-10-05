/**
 * The one place Tova sends mail from.
 *
 * Resend sits behind `sendEmail`, so the provider is a contained change and
 * `auth.ts` never names it. `tova.so` is verified with Resend: `resend._domainkey`
 * signs and `send.tova.so` is the envelope sender, while the apex MX stays with
 * Namecheap's forwarding — so sending here cannot break receiving there.
 *
 * Built per call rather than on import, for the reason `getDb` and `auth` are:
 * Astro evaluates module top-level code at build time too, and `RESEND_API_KEY`
 * is runtime-only.
 */

import { RESEND_API_KEY } from "astro:env/server"
import { Resend } from "resend"

/** Sending needs no mailbox. */
const FROM = "Tova <noreply@tova.so>"

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Throws rather than returning a flag, so a caller cannot ignore a failed send.
 *
 * ⚠️ Better Auth runs `sendVerificationEmail` as a *background task*, so this throw is
 * logged and never reaches the request: sign-up still answers 200 and the account is
 * created even when no mail went out. Any "check your inbox" screen must therefore offer
 * to resend rather than treat a 200 as proof. `sendResetPassword` is not a background
 * task — a failure there does reach the caller.
 */
export async function sendEmail({ to, subject, html, text }: EmailMessage) {
  if (RESEND_API_KEY === undefined || RESEND_API_KEY === "") {
    throw new Error("RESEND_API_KEY is not set — refusing to pretend the message was sent")
  }

  const { data, error } = await new Resend(RESEND_API_KEY).emails.send({
    from: FROM,
    to,
    subject,
    html,
    text
  })

  if (error) throw new Error(`Resend rejected the message: ${error.message}`)
  return data
}

function layout(body: string) {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#111827;max-width:480px">
  ${body}
</div>`
}

function button(url: string, label: string) {
  return `<p><a href="${url}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">${label}</a></p>`
}

/**
 * The copy has to carry what is true of an end-to-end encrypted app and of no other:
 * **a new password does not re-open the notes.** The content key is sealed once per
 * factor, and a new password derives a different wrapping key — so signing in again
 * gets you an account, and the recovery key is what gets you the writing
 * (`docs/SYNC.md`). Sign-in already asks for it; this says so before they get there,
 * because the moment to go and find it is before the reset, not after.
 */
export async function sendPasswordResetEmail(to: string, url: string) {
  await sendEmail({
    to,
    subject: "Reset your Tova password",
    text:
      `Reset your Tova password:\n\n${url}\n\n` +
      `Have your recovery key to hand. Tova encrypts your notes with a key only you hold, ` +
      `so a new password signs you in but does not by itself re-open your existing notes — ` +
      `the recovery key does, and sign-in will ask for it.\n\n` +
      `If you did not ask to reset your password, ignore this message; nothing will change.`,
    html: layout(
      `<p>Reset your Tova password.</p>
  ${button(url, "Choose a new password")}
  <p><strong>Have your recovery key to hand.</strong> Tova encrypts your notes with a key only you hold, so a new password signs you in but does not by itself re-open your existing notes — the recovery key does, and sign-in will ask for it.</p>
  <p style="font-size:13px;color:#6b7280">If you did not ask to reset your password, ignore this message; nothing will change.</p>`
    )
  })
}

export async function sendVerificationEmail(to: string, url: string) {
  await sendEmail({
    to,
    subject: "Verify your email address",
    text: `Confirm your address to finish setting up Tova:\n\n${url}\n\nIf you did not create an account, ignore this message.`,
    html: layout(
      `<p>Confirm your address to finish setting up Tova.</p>
  ${button(url, "Verify email")}
  <p style="font-size:13px;color:#6b7280">If you did not create an account, ignore this message.</p>`
    )
  })
}
