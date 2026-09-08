import { create } from "zustand"
import { PublishRequest, PublishUpdate } from "../../shared/types"

interface PublishState {
  /** Every publish still worth showing, newest last, keyed by attempt id. */
  jobs: PublishUpdate[]
  start: (request: PublishRequest) => Promise<PublishUpdate>
  apply: (update: PublishUpdate) => void
  dismiss: (id: string) => void
}

export const usePublishStore = create<PublishState>((set) => ({
  jobs: [],

  start: async (request) => {
    // The final update also arrives through the event stream; resolving here is
    // what lets the caller record the filename against the note.
    return window.tova.publish.start(request)
  },

  apply: (update) => {
    set((state) => {
      const known = state.jobs.some((job) => job.id === update.id)
      return {
        jobs: known
          ? state.jobs.map((job) => (job.id === update.id ? update : job))
          : [...state.jobs, update]
      }
    })
  },

  dismiss: (id) => {
    set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) }))
  }
}))
