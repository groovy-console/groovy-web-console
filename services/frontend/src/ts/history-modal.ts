import { fromEvent, Subscription, debounceTime, distinctUntilChanged, filter, map } from 'rxjs'
import { HistoryService, SessionMeta, Snapshot } from './history'
import { CodeEditor } from './codemirror'

const UNDO_TIMEOUT_MS = 15_000
const LABEL_MAX_LEN = 40
const SEARCH_DEBOUNCE_MS = 150
const PREVIEW_PLACEHOLDER = 'Hover a row to preview its content.'

export function deriveLabel (content: string): string {
  const lines = content.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') continue
    if (line.startsWith('package ')) continue
    if (line.startsWith('import ')) continue
    if (line.startsWith('//')) continue
    if (line.startsWith('/*') || line.startsWith('*/') || line.startsWith('*')) continue
    return line.length > LABEL_MAX_LEN ? line.slice(0, LABEL_MAX_LEN) + '…' : line
  }
  return 'Untitled session'
}

export function formatTimestamp (ts: number, now: number = Date.now()): string {
  if (ts <= 0) return '—'
  const diffMs = now - ts
  if (diffMs < 60_000) return 'just now'
  if (diffMs < 60 * 60_000) {
    const mins = Math.floor(diffMs / 60_000)
    return `${mins} min ago`
  }
  const date = new Date(ts)
  const nowDate = new Date(now)
  const sameDay = date.toDateString() === nowDate.toDateString()
  const yesterday = new Date(now - 86_400_000)
  const isYesterday = date.toDateString() === yesterday.toDateString()
  const pad2 = (n: number) => n.toString().padStart(2, '0')
  const hhmm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (sameDay) return `Today ${hhmm}`
  if (isYesterday) return `Yesterday ${hhmm}`
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = pad2(date.getDate())
  if (date.getFullYear() === nowDate.getFullYear()) {
    return `${month} ${day}, ${hhmm}`
  }
  return `${month} ${day} ${date.getFullYear()}, ${hhmm}`
}

interface PendingDelete {
  sessionId: string
  meta: SessionMeta
  timeoutId: ReturnType<typeof setTimeout>
  toast: HTMLElement
  undoSub: Subscription
}

export class HistoryModal {
  private modal: HTMLElement
  private currentLabel: HTMLElement
  private currentSnapshotsEl: HTMLElement
  private otherSessionsEl: HTMLElement
  private previewEl: HTMLElement
  private toastsEl: HTMLElement
  private clearAllBtn: HTMLElement
  private closeBtn: HTMLElement
  private backgroundEl: HTMLElement
  private searchInput: HTMLInputElement

  private pendingDeletes = new Map<string, PendingDelete>()
  private storageSub?: Subscription
  // Per-region Subscription containers — torn down and replaced on every
  // re-render so each row's listeners are cleaned up cleanly.
  private currentSnapshotsSubs = new Subscription()
  private otherSessionsSubs = new Subscription()
  private previewSourceRow: HTMLElement | null = null
  private searchQuery = ''

  constructor (
    private historyService: HistoryService,
    private codeEditor: CodeEditor
  ) {
    this.modal = document.getElementById('historyModal')!
    this.currentLabel = document.getElementById('historyCurrentLabel')!
    this.currentSnapshotsEl = document.getElementById('historyCurrentSnapshots')!
    this.otherSessionsEl = document.getElementById('historyOtherSessions')!
    this.previewEl = document.getElementById('historyPreview')!
    this.toastsEl = document.getElementById('historyToasts')!
    this.clearAllBtn = document.getElementById('historyClearAll')!
    this.closeBtn = document.getElementById('historyModalClose')!
    this.backgroundEl = this.modal.querySelector('.modal-background')!
    this.searchInput = document.getElementById('historySearch') as HTMLInputElement

    fromEvent(this.closeBtn, 'click').subscribe(() => this.close())
    fromEvent(this.backgroundEl, 'click').subscribe(() => this.close())
    fromEvent(this.clearAllBtn, 'click').subscribe(() => this.handleClearAll())

    fromEvent(this.searchInput, 'input').pipe(
      map(() => this.searchInput.value.trim().toLowerCase()),
      distinctUntilChanged(),
      debounceTime(SEARCH_DEBOUNCE_MS)
    ).subscribe(q => {
      this.searchQuery = q
      this.renderCurrentSnapshots()
      this.renderOtherSessions()
    })

    fromEvent<KeyboardEvent>(document, 'keydown').pipe(
      filter(e => e.key === 'Escape'),
      filter(() => this.isOpen())
    ).subscribe(() => this.close())

    fromEvent(window, 'beforeunload').subscribe(() => this.flushPendingDeletes())
  }

  public open (): void {
    this.searchQuery = ''
    this.searchInput.value = ''
    this.resetPreview()
    this.render()
    this.modal.classList.add('is-active')

    this.storageSub = fromEvent<StorageEvent>(window, 'storage').pipe(
      filter(e => e.key === 'history-sessions')
    ).subscribe(() => this.render())
  }

  public close (): void {
    this.flushPendingDeletes()
    this.modal.classList.remove('is-active')
    this.storageSub?.unsubscribe()
    this.storageSub = undefined
  }

  private isOpen (): boolean {
    return this.modal.classList.contains('is-active')
  }

  private render (): void {
    this.renderCurrentLabel()
    this.renderCurrentSnapshots()
    this.renderOtherSessions()
  }

  private resetPreview (): void {
    this.previewEl.textContent = PREVIEW_PLACEHOLDER
    this.previewEl.classList.add('has-text-grey-light')
    this.clearPreviewSource()
  }

  private setPreview (content: string, sourceRow: HTMLElement): void {
    this.previewEl.textContent = content === '' ? '(empty)' : content
    this.previewEl.classList.toggle('has-text-grey-light', content === '')
    this.setPreviewSource(sourceRow)
  }

  private setPreviewSource (row: HTMLElement): void {
    if (this.previewSourceRow === row) return
    this.previewSourceRow?.classList.remove('is-preview-source')
    this.previewSourceRow = row
    row.classList.add('is-preview-source')
  }

  private clearPreviewSource (): void {
    this.previewSourceRow?.classList.remove('is-preview-source')
    this.previewSourceRow = null
  }

  private renderCurrentLabel (): void {
    const content = this.historyService.getEditorContent()
    const label = deriveLabel(content)
    this.currentLabel.textContent = label === 'Untitled session' ? label : `— "${label}"`
  }

  private renderCurrentSnapshots (): void {
    this.currentSnapshotsSubs.unsubscribe()
    this.currentSnapshotsSubs = new Subscription()
    this.currentSnapshotsEl.replaceChildren()

    const all = this.historyService.getSnapshots()
    const snapshots = this.searchQuery
      ? all.filter(s => this.matchesSearch(s.content))
      : all
    this.currentSnapshotsEl.classList.toggle('is-empty', snapshots.length === 0)
    if (snapshots.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'has-text-grey is-size-7 p-2'
      empty.textContent = this.searchQuery
        ? 'No snapshots match.'
        : 'No snapshots yet — one is taken every 60 seconds while you type.'
      this.currentSnapshotsEl.appendChild(empty)
      return
    }
    snapshots.forEach(snap => {
      this.currentSnapshotsEl.appendChild(this.buildSnapshotRow(snap))
    })
  }

  private matchesSearch (content: string): boolean {
    if (this.searchQuery === '') return true
    return content.toLowerCase().includes(this.searchQuery)
  }

  private buildSnapshotRow (snapshot: Snapshot): HTMLElement {
    const row = document.createElement('div')
    row.className = 'history-row'
    this.currentSnapshotsSubs.add(
      fromEvent(row, 'mouseenter').subscribe(() => this.setPreview(snapshot.content, row))
    )

    const time = document.createElement('span')
    time.className = 'history-row-time'
    time.textContent = formatTimestamp(Date.parse(snapshot.timestamp))

    const label = document.createElement('span')
    label.className = 'history-row-label'
    label.textContent = deriveLabel(snapshot.content)

    const btn = document.createElement('button')
    btn.className = 'button is-small'
    btn.textContent = 'Restore'
    this.currentSnapshotsSubs.add(
      fromEvent(btn, 'click').subscribe(() => this.handleRestore(snapshot))
    )

    row.appendChild(time)
    row.appendChild(label)
    row.appendChild(btn)
    return row
  }

  private renderOtherSessions (): void {
    this.otherSessionsSubs.unsubscribe()
    this.otherSessionsSubs = new Subscription()
    this.otherSessionsEl.replaceChildren()

    const sessions = this.historyService.getOtherSessions()
      .filter(s => !this.pendingDeletes.has(s.id))
      .filter(s => this.matchesSearch(this.historyService.getSessionContent(s.id)))

    this.otherSessionsEl.classList.toggle('is-empty', sessions.length === 0)
    if (sessions.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'has-text-grey is-size-7 p-2'
      empty.textContent = this.searchQuery
        ? 'No sessions match.'
        : 'No other sessions.'
      this.otherSessionsEl.appendChild(empty)
      return
    }

    sessions.forEach(meta => {
      this.otherSessionsEl.appendChild(this.buildSessionRow(meta))
    })
  }

  private buildSessionRow (meta: SessionMeta): HTMLElement {
    const content = this.historyService.getSessionContent(meta.id)

    const row = document.createElement('div')
    row.className = 'history-row'
    row.dataset.sessionId = meta.id
    this.otherSessionsSubs.add(
      fromEvent(row, 'mouseenter').subscribe(() => this.setPreview(content, row))
    )

    const label = document.createElement('span')
    label.className = 'history-row-label'
    label.textContent = deriveLabel(content)

    const time = document.createElement('span')
    time.className = 'history-row-time'
    time.textContent = formatTimestamp(meta.lastModified)

    const switchBtn = document.createElement('button')
    switchBtn.className = 'button is-small'
    switchBtn.textContent = 'Switch'
    this.otherSessionsSubs.add(
      fromEvent(switchBtn, 'click').subscribe(() => this.handleSwitch(meta.id))
    )

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'button is-small delete-session'
    deleteBtn.setAttribute('aria-label', 'delete session')
    const deleteIcon = document.createElement('span')
    // has-text-danger keeps the trash icon red (recognizable as a destructive
    // action) while the button itself stays neutral so it adapts to dark mode
    // instead of being permanently pale-red via `is-light is-danger`.
    deleteIcon.className = 'icon is-small has-text-danger'
    const deleteIconI = document.createElement('i')
    deleteIconI.className = 'fas fa-trash'
    deleteIcon.appendChild(deleteIconI)
    deleteBtn.appendChild(deleteIcon)
    this.otherSessionsSubs.add(
      fromEvent(deleteBtn, 'click').subscribe(() => this.handleDelete(meta))
    )

    row.appendChild(label)
    row.appendChild(time)
    row.appendChild(switchBtn)
    row.appendChild(deleteBtn)
    return row
  }

  private handleRestore (snapshot: Snapshot): void {
    const restored = this.historyService.restoreSnapshot(snapshot)
    this.codeEditor.setCode(restored)
    this.render()
  }

  private handleSwitch (sessionId: string): void {
    this.flushPendingDeletes()
    this.historyService.switchToSession(sessionId)
  }

  private handleDelete (meta: SessionMeta): void {
    if (this.pendingDeletes.has(meta.id)) return

    const { toast, undoSub } = this.buildToast(meta)
    this.toastsEl.appendChild(toast)

    const timeoutId = setTimeout(() => this.commitDelete(meta.id), UNDO_TIMEOUT_MS)
    this.pendingDeletes.set(meta.id, { sessionId: meta.id, meta, timeoutId, toast, undoSub })
    this.renderOtherSessions()
  }

  private buildToast (meta: SessionMeta): { toast: HTMLElement, undoSub: Subscription } {
    const toast = document.createElement('div')
    toast.className = 'notification is-warning history-toast'
    toast.dataset.sessionId = meta.id
    toast.textContent = 'Session deleted. '

    const undo = document.createElement('button')
    undo.className = 'button is-small is-text history-toast-undo'
    undo.textContent = 'Undo'
    toast.appendChild(undo)

    const undoSub = fromEvent(undo, 'click').subscribe(() => this.undoDelete(meta.id))
    return { toast, undoSub }
  }

  private undoDelete (sessionId: string): void {
    const pending = this.pendingDeletes.get(sessionId)
    if (!pending) return
    clearTimeout(pending.timeoutId)
    pending.undoSub.unsubscribe()
    pending.toast.remove()
    this.pendingDeletes.delete(sessionId)
    this.renderOtherSessions()
  }

  private commitDelete (sessionId: string): void {
    const pending = this.pendingDeletes.get(sessionId)
    if (!pending) return
    clearTimeout(pending.timeoutId)
    pending.undoSub.unsubscribe()
    pending.toast.remove()
    this.pendingDeletes.delete(sessionId)
    this.historyService.deleteSession(sessionId)
  }

  private flushPendingDeletes (): void {
    Array.from(this.pendingDeletes.keys()).forEach(id => this.commitDelete(id))
  }

  private handleClearAll (): void {
    const sessions = this.historyService.getOtherSessions().length + 1
    if (!window.confirm(`Delete all ${sessions} session(s) and their snapshots? This can't be undone.`)) {
      return
    }
    this.flushPendingDeletes()
    this.historyService.clearAllSessions()
    this.resetPreview()
    this.render()
  }
}
