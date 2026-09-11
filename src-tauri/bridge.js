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
  tova.notes.move = (id, input) => invoke("note_move", { id, input })
  tova.notes.remove = (id) => invoke("note_remove", { id })
  tova.notes.restore = (id) => invoke("note_restore", { id })
  tova.notes.permanentDelete = (id) => invoke("note_permanent_delete", { id })
  tova.notes.listFolders = () => invoke("folder_list")
  tova.notes.createFolder = (name) => invoke("folder_create", { name })
  tova.notes.renameFolder = (from, to) => invoke("folder_rename", { from, to })
  tova.notes.deleteFolder = (name) => invoke("folder_delete", { name })
  tova.notes.createSection = (id) => invoke("section_create", { id })
  tova.notes.deleteSection = (id) => invoke("section_delete", { id })
  tova.notes.search = (query) => invoke("note_search", { query })
  tova.notes.today = () => invoke("note_today")
  tova.backups.run = () => invoke("backup_run")
  tova.backups.list = () => invoke("backup_list")
  tova.backups.restore = (name) => invoke("backup_restore", { name })
  tova.backups.status = () => invoke("backup_status")
  tova.preferences.listBackgrounds = (theme) => invoke("background_list", { theme })
  tova.preferences.addBackground = (theme) => invoke("background_add", { theme })
  tova.preferences.listTitleFonts = () => invoke("font_list")
  tova.preferences.addTitleFont = () => invoke("font_add")
  tova.preferences.removeTitleFont = (name) => invoke("font_remove", { name })
  tova.preferences.titleFontUrl = (name) => invoke("font_url", { name })
  tova.preferences.chooseAvatar = () => invoke("prefs_choose_avatar")
  tova.preferences.avatarSources = () => invoke("prefs_avatar_sources")
  tova.preferences.reset = () => invoke("settings_reset")
  tova.preferences.nukeTargets = () => invoke("settings_nuke_targets")
  tova.preferences.nuke = () => invoke("settings_nuke")
  tova.app.reveal = (target) => invoke("app_reveal", { target })
  tova.app.openExternal = (url) => invoke("app_open_external", { url })
  // Bytes cross as an array: Tauri's invoke serialises arguments as JSON, so a
  // Uint8Array has to be spelled out rather than passed as the view it is.
  tova.images.save = (name, bytes) =>
    invoke("image_save", { name, bytes: Array.from(new Uint8Array(bytes)) })
  tova.notes.exportMarkdown = (id) => invoke("note_export", { id })
  tova.blogs.list = () => invoke("blog_list")
  tova.blogs.save = (blog) => invoke("blog_save", { blog })
  tova.blogs.remove = (id, trashPosts) => invoke("blog_delete", { id, trashPosts })
  tova.blogs.postCount = (id) => invoke("blog_post_count", { id })
  tova.blogs.setSecret = (id, secret, value) => invoke("blog_set_secret", { id, secret, value })
  tova.blogs.canStoreSecrets = () => invoke("blog_can_store_secrets")
  tova.blogs.lastSynced = () => invoke("blog_last_synced")
  tova.blogs.sync = (id) => invoke("blog_sync", { id })
  tova.blogs.conflict = (id, filename) => invoke("blog_conflict", { id, filename })
  tova.blogs.resolve = (id, filename, keep) => invoke("blog_resolve", { id, filename, keep })
  tova.blogs.deletePost = (id, filename, alsoRemote) =>
    invoke("blog_delete_post", { id, filename, alsoRemote })
  tova.publish.start = (request) => invoke("publish_start", { request })
  // An event rather than a channel, the way the Electron side sends to the
  // window that asked. Tauri's listen is async and the renderer expects an
  // unsubscribe straight away, so the returned function waits for the
  // subscription before undoing it.
  tova.publish.onUpdate = (listener) => {
    const stopping = window.__TAURI__.event.listen("publish:update", (event) =>
      listener(event.payload)
    )
    return () => {
      void stopping.then((stop) => stop())
    }
  }

  window.tova = tova
})()
