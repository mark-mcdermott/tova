/*
 * window.tova, built out of Tauri commands.
 *
 * The counterpart of src/preload/index.ts. Every name here matches the one the
 * Electron preload uses, because the renderer must not be able to tell which
 * backend it is talking to — that is what keeps both runnable side by side.
 *
 * Methods arrive as their commands are ported. Anything not yet ported throws
 * by name rather than returning undefined, so a gap is a loud failure in the
 * console and not a component rendering blank.
 */
;(() => {
  const invoke = (name, args) => window.__TAURI__.core.invoke(name, args)

  const pending = (group, method) => () => {
    throw new Error(`tova.${group}.${method} is not ported yet`)
  }

  /** Groups and their methods, from src/shared/types.ts. */
  const SURFACE = {
    notes: [
      "list", "read", "write", "create", "rename", "move", "remove", "restore",
      "permanentDelete", "setFavorite", "setTags", "today", "listFolders",
      "createFolder", "renameFolder", "deleteFolder", "exportMarkdown",
      "exportPdf", "search", "createSection", "deleteSection"
    ],
    backups: ["run", "list", "restore", "status", "listVersions", "readVersion"],
    images: ["save"],
    blogs: [
      "list", "save", "remove", "postCount", "setSecret", "canStoreSecrets",
      "sync", "lastSynced", "conflict", "resolve", "deletePost"
    ],
    publish: ["start", "onUpdate"],
    spellcheck: ["onSuggest", "replace", "addWord", "removeWord", "listWords", "setEnabled"],
    session: ["read", "write"],
    preferences: [
      "read", "write", "chooseAvatar", "avatarSources", "accountName", "reset",
      "nukeTargets", "nuke", "listBackgrounds", "addBackground", "listTitleFonts",
      "addTitleFont", "removeTitleFont", "titleFontUrl", "listVaults", "addVault",
      "useVault", "forgetVault", "encryptVault", "decryptVault", "unlockVault"
    ],
    app: ["info", "reveal", "openExternal"],
    events: ["onNotesChanged"]
  }

  const tova = {}
  for (const [group, methods] of Object.entries(SURFACE)) {
    tova[group] = {}
    for (const method of methods) tova[group][method] = pending(group, method)
  }

  // Ported so far. One line per slice, and the list is the progress bar.
  tova.app.info = () => invoke("app_info")
  tova.preferences.read = () => invoke("preferences_read")
  tova.preferences.write = (value) => invoke("preferences_write", { value })
  tova.preferences.accountName = () => invoke("account_name")
  tova.session.read = () => invoke("session_read")
  tova.session.write = (value) => invoke("session_write", { value })
  tova.preferences.listVaults = () => invoke("vault_list")
  tova.preferences.useVault = (path) => invoke("vault_use", { path })
  tova.preferences.addVault = () => invoke("vault_add")
  tova.preferences.forgetVault = (path) => invoke("vault_forget", { path })
  tova.preferences.encryptVault = (path) => invoke("vault_encrypt", { path })
  tova.preferences.decryptVault = (path) => invoke("vault_decrypt", { path })
  tova.preferences.unlockVault = (path, recoveryKey) =>
    invoke("vault_unlock", { path, recoveryKey })
  tova.notes.list = () => invoke("note_list")
  tova.notes.read = (id) => invoke("note_read", { id })
  tova.notes.create = (input) => invoke("note_create", { input })
  tova.notes.write = (id, title, body) => invoke("note_write", { id, title, body })
  tova.notes.rename = (id, title) => invoke("note_rename", { id, title })
  tova.notes.setFavorite = (id, favorite) => invoke("note_favorite", { id, favorite })
  tova.notes.setTags = (id, tags) => invoke("note_tags", { id, tags })
  tova.backups.listVersions = (id) => invoke("note_versions", { id })
  tova.backups.readVersion = (id, version) => invoke("note_version_read", { id, version })

  window.tova = tova
})()
