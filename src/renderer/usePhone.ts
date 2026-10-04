import { useEffect, useState } from "react"
import { isPhone, watchPhone } from "./phone"

/** Re-renders when the viewport crosses into or out of the one-pane layout. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(isPhone)

  useEffect(() => watchPhone(setPhone), [])

  return phone
}
