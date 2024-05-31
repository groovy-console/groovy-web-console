interface Snapshot {
  content: string
  timestamp: string
}

/**
 * Service to manage the history of the editor content.
 *
 * It manages the snapshots of the editor content and the last saved content.
 * It will save the content and store a snapshot every 60 seconds and keep the last 50 snapshots.
 * The snapshots are stored per session in the local storage.
 * The sessionId is stored as fragment in the URL.
 */
export class HistoryService {
  private lastSavedContent:string
  private lastSnapshotTimestamp = 0
  private snapshots: Snapshot[] = []
  private sessionId = this.getSessionId()

  constructor () {
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

  private getSessionId () {
    let sessionId = window.location.hash.substring(1)
    const sessions = JSON.parse(localStorage.getItem('history-sessions') || '[]')
    if (!sessionId) {
      do {
        sessionId = this.generateShortId()
      } while (sessions.includes(sessionId))
      window.location.hash = sessionId
    }
    if (!sessions.includes(sessionId)) {
      sessions.push(sessionId)
      localStorage.setItem('history-sessions', JSON.stringify(sessions))
    }
    return sessionId
  }

  /**
   * Load the snapshots from the local storage.
   */
  private loadSnapshots () {
    const snapshots = JSON.parse(localStorage.getItem('history-snapshots-' + this.sessionId) || '[]')
    this.snapshots = snapshots.filter((snapshot: Snapshot) => snapshot.content !== '')
    this.lastSavedContent = snapshots.length > 0 ? snapshots[snapshots.length - 1].content : ''
    this.lastSnapshotTimestamp = snapshots.length > 0 ? Date.parse(snapshots[snapshots.length - 1].timestamp) : 0
  }

  public storeEditorContent (content: string) {
    const currentTime = Date.now()
    if (this.lastSavedContent !== '' && (currentTime - this.lastSnapshotTimestamp >= 60000)) {
      const snapshots = this.snapshots
      if (snapshots.length >= 50) {
        snapshots.shift()
      }
      snapshots.push({ content: this.lastSavedContent, timestamp: new Date().toISOString() })
      localStorage.setItem('history-snapshots-' + this.sessionId, JSON.stringify(snapshots))
      this.lastSnapshotTimestamp = currentTime
    }

    this.lastSavedContent = content
    localStorage.setItem('history-editorContent-' + this.sessionId, content)
  }

  public getSnapshots () {
    return this.snapshots
  }

  public getEditorContent () {
    return localStorage.getItem('history-editorContent-' + this.sessionId) || '\n\n\n\n'
  }

  public clearCurrentSession () {
    localStorage.removeItem('history-snapshots-' + this.sessionId)
    localStorage.removeItem('history-editorContent-' + this.sessionId)
    this.snapshots = []
    this.lastSavedContent = ''
  }

  public clearAllSessions () {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('history-')) {
        localStorage.removeItem(key)
      }
    })
  }
}
