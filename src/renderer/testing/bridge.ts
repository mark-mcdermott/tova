import { vi } from "vitest"
import { DEFAULT_PREFERENCES } from "../../shared/preferences"

type Bridge = Window["tova"]

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> }

/**
 * A complete `window.tova` of mocks. Tests override only what they exercise,
 * so adding a method to the bridge does not mean editing every test file that
 * happens to render a component near it.
 */
export function stubBridge(overrides: DeepPartial<Bridge> = {}): Bridge {
  const bridge = {
    notes: {
      list: vi.fn(async () => []),
      read: vi.fn(),
      write: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      move: vi.fn(),
      remove: vi.fn(),
      restore: vi.fn(),
      permanentDelete: vi.fn(),
      setFavorite: vi.fn(),
      today: vi.fn(),
      listFolders: vi.fn(async () => []),
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      deleteFolder: vi.fn(),
      exportMarkdown: vi.fn()
    },
    backups: {
      run: vi.fn(),
      list: vi.fn(async () => []),
      restore: vi.fn(),
      status: vi.fn(),
      listVersions: vi.fn(async () => []),
      readVersion: vi.fn()
    },
    images: { save: vi.fn() },
    blogs: {
      list: vi.fn(async () => []),
      save: vi.fn(),
      remove: vi.fn(),
      postCount: vi.fn(async () => 0),
      setSecret: vi.fn(),
      canStoreSecrets: vi.fn(async () => true),
      sync: vi.fn(),
      lastSynced: vi.fn(async () => ({})),
      conflict: vi.fn(),
      resolve: vi.fn(),
      deletePost: vi.fn()
    },
    publish: { start: vi.fn(), onUpdate: vi.fn(() => () => undefined) },
    spellcheck: {
      onSuggest: vi.fn(() => () => undefined),
      replace: vi.fn(),
      addWord: vi.fn(async () => []),
      removeWord: vi.fn(async () => []),
      listWords: vi.fn(async () => []),
      setEnabled: vi.fn()
    },
    preferences: {
      read: vi.fn(async () => ({ ...DEFAULT_PREFERENCES })),
      write: vi.fn(async (value: unknown) => value),
      chooseAvatar: vi.fn(),
      avatarUrl: vi.fn(async () => null)
    },
    app: { info: vi.fn(), reveal: vi.fn(), openExternal: vi.fn() },
    events: { onNotesChanged: vi.fn(() => () => undefined) }
  } as unknown as Bridge

  for (const [group, methods] of Object.entries(overrides)) {
    Object.assign(bridge[group as keyof Bridge], methods)
  }
  return bridge
}
