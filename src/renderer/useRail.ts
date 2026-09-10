import { SectionConfig, reconcileBlogs } from "../shared/sections"
import { useBlogsStore } from "./stores/blogsStore"
import { usePreferencesStore } from "./stores/preferencesStore"

/**
 * The sidebar's rail: the stored arrangement, brought level with the blogs that
 * are actually configured.
 *
 * Derived rather than stored, because blogs live in the app's data directory
 * and preferences cannot see them. A blog appears in the rail the moment it is
 * added and leaves when it is deleted; only arranging one writes it down.
 */
export function useRail(): SectionConfig[] {
  const sections = usePreferencesStore((state) => state.preferences.sections)
  const blogs = useBlogsStore((state) => state.blogs)

  return reconcileBlogs(sections, blogs)
}
