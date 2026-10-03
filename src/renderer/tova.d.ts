import type { TovaBridge } from "../shared/types"

declare global {
  interface Window {
    tova: TovaBridge
  }
}

export {}
