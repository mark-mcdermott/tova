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
      "list",
      "read",
      "write",
      "create",
      "rename",
      "move",
      "remove",
      "restore",
      "permanentDelete",
      "setFavorite",
      "setTags",
      "today",
      "listFolders",
      "createFolder",
      "renameFolder",
      "deleteFolder",
      "exportMarkdown",
      "exportPdf",
      "search",
      "createSection",
      "deleteSection"
    ],
    backups: ["run", "list", "restore", "status", "listVersions", "readVersion"],
    images: ["save"],
    blogs: [
      "list",
      "save",
      "remove",
      "postCount",
      "setSecret",
      "canStoreSecrets",
      "sync",
      "lastSynced",
      "conflict",
      "resolve",
      "deletePost"
    ],
    publish: ["start", "onUpdate"],
    spellcheck: ["onSuggest", "replace", "addWord", "removeWord", "listWords", "setEnabled"],
    session: ["read", "write"],
    preferences: [
      "read",
      "write",
      "chooseAvatar",
      "avatarSources",
      "accountName",
      "reset",
      "nukeTargets",
      "nuke",
      "listBackgrounds",
      "addBackground",
      "listTitleFonts",
      "addTitleFont",
      "removeTitleFont",
      "titleFontUrl",
      "listVaults",
      "addVault",
      "useVault",
      "forgetVault",
      "encryptVault",
      "decryptVault",
      "unlockVault"
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
  tova.notes.exportPdf = (id) => invoke("note_export_pdf", { id })
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
  tova.events.onNotesChanged = (listener) => {
    const stopping = window.__TAURI__.event.listen("notes:changed", () => listener())
    return () => {
      void stopping.then((stop) => stop())
    }
  }
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

  /*
   * Spelling.
   *
   * The only part of the surface that is not a command with a different name
   * underneath. Electron got the misspelled word and its suggestions handed to
   * it by Chromium, from the event that opened the context menu; WKWebView
   * offers nothing of the kind. So the work moves here — which is the right
   * place for it, because the preload it replaces is renderer-side too, and
   * because everything needed is in the document.
   *
   * What the backend is asked is deliberately small: a line and a position.
   * The spell checker decides where the word starts and ends, so no idea of
   * what a word is lives in this file.
   */
  let spellingOn = true
  let clicked = null
  const spellingListeners = new Set()

  /** The editor line a point landed in, and where in its text that is. */
  const lineAt = (x, y) => {
    const caret = document.caretRangeFromPoint(x, y)
    if (caret === null) return null

    const line = caret.startContainer.parentElement?.closest(".cm-line")
    if (!line) return null

    // Everything before the caret within the line, measured as the text the
    // reader sees rather than as nodes.
    const before = document.createRange()
    before.setStart(line, 0)
    before.setEnd(caret.startContainer, caret.startOffset)

    return { line, text: line.textContent ?? "", at: before.toString().length }
  }

  /**
   * A DOM range over `[from, to)` of a line's text, so a replacement lands on
   * the word rather than near it. Walks the text nodes because a highlighted
   * line is many of them.
   */
  const rangeOver = (line, from, to) => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    let seen = 0
    let started = false

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const length = node.data.length
      if (!started && seen + length >= from) {
        range.setStart(node, from - seen)
        started = true
      }
      if (started && seen + length >= to) {
        range.setEnd(node, to - seen)
        return range
      }
      seen += length
    }
    return started ? range : null
  }

  document.addEventListener("contextmenu", (event) => {
    if (!spellingOn || spellingListeners.size === 0) return

    const found = lineAt(event.clientX, event.clientY)
    if (found === null) return

    invoke("spellcheck_suggest", { line: found.text, at: found.at }).then((misspelling) => {
      if (misspelling === null) return

      // Held so `replace` knows what it is replacing. The word, not the click.
      clicked = rangeOver(found.line, misspelling.from, misspelling.to)
      const update = {
        word: misspelling.word,
        suggestions: misspelling.suggestions,
        x: event.clientX,
        y: event.clientY
      }
      for (const listener of spellingListeners) listener(update)
    })
  })

  tova.spellcheck.onSuggest = (listener) => {
    spellingListeners.add(listener)
    return () => spellingListeners.delete(listener)
  }

  /*
   * Typed in rather than written into the DOM: the editor is a CodeMirror
   * document, and text that appears underneath it without an input event is
   * text CodeMirror does not know it has. `insertText` is the same event a
   * keystroke raises, which is also what the system's own spelling menu uses.
   */
  tova.spellcheck.replace = async (word) => {
    if (clicked === null) return
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(clicked)
    document.execCommand("insertText", false, word)
    clicked = null
  }

  /*
   * The squiggles are the webview's, so turning them off is a matter of
   * telling the document rather than the backend — and the menu stops
   * offering itself at the same time.
   */
  tova.spellcheck.setEnabled = async (enabled) => {
    spellingOn = enabled === true
    document.body.spellcheck = spellingOn
    for (const editable of document.querySelectorAll("[contenteditable]")) {
      editable.spellcheck = spellingOn
    }
  }

  tova.spellcheck.listWords = () => invoke("spellcheck_words")
  tova.spellcheck.addWord = (word) => invoke("spellcheck_add_word", { word })
  tova.spellcheck.removeWord = (word) => invoke("spellcheck_remove_word", { word })

  window.tova = tova
})()
