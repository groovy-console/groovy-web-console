export interface Snapshot {
  content: string
  timestamp: string
}

export interface SessionMeta {
  id: string
  lastModified: number
}

const SESSIONS_KEY = 'history-sessions'
const contentKey = (id: string) => `history-editorContent-${id}`
const snapshotsKey = (id: string) => `history-snapshots-${id}`

function safeParse<T> (raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function readSessions (): SessionMeta[] {
  return safeParse<SessionMeta[]>(localStorage.getItem(SESSIONS_KEY), [])
}

function writeSessions (sessions: SessionMeta[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

function isBlank (s: string): boolean {
  return s.trim() === ''
}

function isSnapshot (s: unknown): s is Snapshot {
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof (s as { content?: unknown }).content === 'string' &&
    typeof (s as { timestamp?: unknown }).timestamp === 'string'
  )
}

function readSnapshots (id: string): Snapshot[] {
  // localStorage payloads can be malformed (external tampering, a different
  // version of the app having written there, a partial write). Validate each
  // entry's shape rather than trusting the JSON.
  return safeParse<unknown[]>(localStorage.getItem(snapshotsKey(id)), [])
    .filter(isSnapshot)
    .filter(s => !isBlank(s.content))
}

/**
 * Service to manage the history of the editor content.
 *
 * Snapshots are taken every 60 seconds (cap 50 per session), stored in
 * localStorage per session id. The session id lives in the URL fragment so
 * refresh/bookmark within the same browser stays on the same session;
 * localStorage is per-origin so the id is NOT cross-browser shareable.
 */
export class HistoryService {
  private lastSavedContent: string = ''
  private lastSnapshotTimestamp = 0
  private snapshots: Snapshot[] = []
  private sessionId: string
  // True once this session has any persisted non-empty content, i.e. it has
  // earned its slot in `history-sessions`.
  private registered = false

  constructor () {
    this.migrateSessions()
    this.sessionId = this.resolveSessionId()
    this.registered = this.knownSessionIds().includes(this.sessionId)
    this.loadSnapshots()
  }

  private generateShortId (length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * Reads the session id from the URL fragment, or generates a new one and
   * writes it to the fragment. Does NOT register the session in
   * `history-sessions` — that's deferred to the first non-empty save.
   */
  private resolveSessionId (): string {
    let sessionId = window.location.hash.substring(1)
    if (!sessionId) {
      const known = new Set(this.knownSessionIds())
      do {
        sessionId = this.generateShortId()
      } while (known.has(sessionId))
      window.location.hash = sessionId
    }
    return sessionId
  }

  private knownSessionIds (): string[] {
    return readSessions().map(s => s.id)
  }

  /**
   * One-time-per-load (but idempotent) sweep:
   *  - upgrade old `string[]` shape to SessionMeta[]
   *  - drop entries whose content is empty AND have no non-empty snapshots
   *    (cleans up the empty-shell leftovers from the previous eager-registration behaviour)
   *  - backfill `lastModified` from the most recent snapshot when missing
   */
  private migrateSessions (): void {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (raw === null) return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      localStorage.removeItem(SESSIONS_KEY)
      return
    }
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(SESSIONS_KEY)
      return
    }

    const survivors: SessionMeta[] = []
    for (const entry of parsed) {
      try {
        const id = typeof entry === 'string' ? entry : (entry && typeof entry.id === 'string' ? entry.id : null)
        if (id === null) continue

        const content = localStorage.getItem(contentKey(id)) || ''
        const snapshots = readSnapshots(id)
        // Blank-only content with no non-blank snapshots = nothing worth keeping.
        if (isBlank(content) && snapshots.length === 0) {
          localStorage.removeItem(contentKey(id))
          localStorage.removeItem(snapshotsKey(id))
          continue
        }

        let lastModified = typeof entry === 'object' && entry !== null && typeof entry.lastModified === 'number'
          ? entry.lastModified
          : 0
        if (lastModified === 0 && snapshots.length > 0) {
          const ts = Date.parse(snapshots[snapshots.length - 1].timestamp)
          if (!isNaN(ts)) lastModified = ts
        }
        survivors.push({ id, lastModified })
      } catch {
        // skip corrupt entry
      }
    }

    writeSessions(survivors)
  }

  private loadSnapshots (): void {
    this.snapshots = readSnapshots(this.sessionId)
    if (this.snapshots.length > 0) {
      const last = this.snapshots[this.snapshots.length - 1]
      this.lastSavedContent = last.content
      this.lastSnapshotTimestamp = Date.parse(last.timestamp) || 0
    }
    const editor = localStorage.getItem(contentKey(this.sessionId))
    if (editor !== null && !isBlank(editor)) {
      this.lastSavedContent = editor
    }
  }

  private touchSession (lastModified: number): void {
    const sessions = readSessions()
    const idx = sessions.findIndex(s => s.id === this.sessionId)
    if (idx === -1) {
      sessions.push({ id: this.sessionId, lastModified })
    } else {
      sessions[idx].lastModified = lastModified
    }
    writeSessions(sessions)
    this.registered = true
  }

  public storeEditorContent (content: string): void {
    const currentTime = Date.now()

    // Snapshot only the previous *meaningful* content. Whitespace-only edits
    // (e.g. someone typing then deleting back to blank) are never snapshotted
    // and never count toward "last modified" — they wouldn't be useful to
    // restore and they'd clutter the session list with Untitled entries.
    if (!isBlank(this.lastSavedContent) && (currentTime - this.lastSnapshotTimestamp >= 60_000)) {
      this.appendSnapshot(this.lastSavedContent, new Date().toISOString())
      this.lastSnapshotTimestamp = currentTime
    }

    this.lastSavedContent = content
    try {
      localStorage.setItem(contentKey(this.sessionId), content)
    } catch (e) {
      console.warn('Failed to persist editor content', e)
    }

    if (!isBlank(content)) {
      // Anchor the 60-s snapshot window on the FIRST non-blank save. Without
      // this, lastSnapshotTimestamp stays at 0 and the second save snapshots
      // immediately (currentTime - 0 is always >= 60_000).
      if (this.lastSnapshotTimestamp === 0) this.lastSnapshotTimestamp = currentTime
      this.touchSession(currentTime)
    }
  }

  private appendSnapshot (content: string, timestamp: string): void {
    if (this.snapshots.length >= 50) {
      this.snapshots.shift()
    }
    this.snapshots.push({ content, timestamp })
    try {
      localStorage.setItem(snapshotsKey(this.sessionId), JSON.stringify(this.snapshots))
    } catch (e) {
      console.warn('Failed to persist snapshot', e)
    }
  }

  public getSnapshots (): Snapshot[] {
    return this.snapshots.slice()
  }

  public getEditorContent (): string {
    return localStorage.getItem(contentKey(this.sessionId)) || ''
  }

  public getCurrentSessionId (): string {
    return this.sessionId
  }

  public getOtherSessions (): SessionMeta[] {
    return readSessions()
      .filter(s => s.id !== this.sessionId)
      .sort((a, b) => b.lastModified - a.lastModified)
  }

  public getSessionContent (sessionId: string): string {
    return localStorage.getItem(contentKey(sessionId)) || ''
  }

  public deleteSession (sessionId: string): void {
    const sessions = readSessions().filter(s => s.id !== sessionId)
    writeSessions(sessions)
    localStorage.removeItem(contentKey(sessionId))
    localStorage.removeItem(snapshotsKey(sessionId))
  }

  public switchToSession (sessionId: string): void {
    // Strip query params (e.g. ?codez=...) so the loaded session content
    // isn't overridden by loadFromUrl on the next load. Hash-only changes
    // don't trigger a navigation, so update the URL via replaceState and
    // then reload explicitly.
    window.history.replaceState(null, '', `${window.location.pathname}#${sessionId}`)
    window.location.reload()
  }

  public createNewSession (): void {
    window.history.replaceState(null, '', window.location.pathname)
    window.location.reload()
  }

  /**
   * Forces a snapshot of the last persisted content, bypassing the 60-second
   * guard. No-op when there's nothing meaningful to capture (empty or
   * whitespace-only).
   */
  public snapshotNow (): void {
    if (isBlank(this.lastSavedContent)) return
    this.appendSnapshot(this.lastSavedContent, new Date().toISOString())
    this.lastSnapshotTimestamp = Date.now()
  }

  /**
   * Performs the safety-snapshot of current content, then swaps in the
   * chosen snapshot's content and persists it. Returns the content so the
   * caller can hand it to the editor.
   */
  public restoreSnapshot (snapshot: Snapshot): string {
    this.snapshotNow()
    this.lastSavedContent = snapshot.content
    try {
      localStorage.setItem(contentKey(this.sessionId), snapshot.content)
    } catch (e) {
      console.warn('Failed to persist restored snapshot', e)
    }
    this.touchSession(Date.now())
    return snapshot.content
  }

  public clearCurrentSession (): void {
    localStorage.removeItem(snapshotsKey(this.sessionId))
    localStorage.removeItem(contentKey(this.sessionId))
    const sessions = readSessions().filter(s => s.id !== this.sessionId)
    writeSessions(sessions)
    this.snapshots = []
    this.lastSavedContent = ''
    this.registered = false
  }

  /**
   * Removes content + snapshot keys for every known session, then the index itself.
   * Does not blanket-nuke unknown `history-`-prefixed keys.
   */
  public clearAllSessions (): void {
    const sessions = readSessions()
    sessions.forEach(s => {
      localStorage.removeItem(contentKey(s.id))
      localStorage.removeItem(snapshotsKey(s.id))
    })
    localStorage.removeItem(SESSIONS_KEY)
    this.snapshots = []
    this.lastSavedContent = ''
    this.registered = false
  }
}
