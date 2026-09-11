import { DisplayNameSource } from "../shared/preferences"

/**
 * The name the sidebar shows, which is also the name the initials come from.
 *
 * The account name is read where it lives rather than copied into preferences,
 * so renaming the account renames it here — the same bargain the account
 * picture makes.
 */
export function resolveDisplayName(
  source: DisplayNameSource,
  typed: string,
  account: string
): string {
  if (source === "custom") return typed
  if (source === "system") return account
  return ""
}

/**
 * Whether a source has anything behind it. A machine with no account to ask
 * about should not be offered a name from it.
 */
export function offersDisplayName(source: DisplayNameSource, account: string): boolean {
  return source !== "system" || account !== ""
}
