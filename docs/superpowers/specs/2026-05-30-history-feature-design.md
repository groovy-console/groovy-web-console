# History Feature — Design

Status: approved
Owner: frontend
Component: `services/frontend`

## Goal

The frontend has a `HistoryService` (`services/frontend/src/ts/history.ts`) that already snapshots editor content every 60 seconds and tracks sessions in `localStorage`, but the UI exposes none of it — the "History" dropdown only contains a "New Session" link. This design fleshes the feature out into a fully usable history UX, covering both **session switching** and **snapshot restore**, surfaced through a modal.

## Out of scope

- Cross-tab synchronisation beyond a passive refresh-on-storage-event in the modal.
- Server-side persistence or cross-browser sync. History stays browser-local.
- Cross-session snapshot restore (restoring a snapshot from a session you're not in). Switch first, then restore.
- Search across sessions, diff between snapshots, named-save points. Possible follow-ups, not v1.

## User-visible shape

The existing "History" dropdown is reduced to two items:

- **Open History…** — opens the modal.
- **New Session** — unchanged (`href="."`).

The modal (Bulma `modal-card`, max-width ~720 px, max-height ~80 vh):

```
┌─ History ───────────────────────────────────────── ✕ ┐
│  Current session — "println hello world"             │
│  ────────────────────────────────────────────────── │
│  • now            "println hello world" [Restore]    │  scrollable
│  • 5 min ago      "println hi"          [Restore]    │  ~35vh
│  • 14 min ago     "def x = …"           [Restore]    │
│                                                       │
│  Other sessions                                       │
│  ────────────────────────────────────────────────── │
│  "class Foo { … }"     2 min ago    [Switch] [🗑]    │  scrollable
│  "import …; def x"     Yesterday    [Switch] [🗑]    │  ~35vh
│                                                       │
├───────────────────────────────────────────────────────┤
│  [Clear all sessions]                       (toasts)  │
└───────────────────────────────────────────────────────┘
```

Two independently scrolling regions inside `modal-card-body`. `modal-card-foot` pins "Clear all sessions" (left) and stacks any pending-delete toasts (right).

The current session is **hidden** from the "Other sessions" list — its snapshots are the top region; there's no "switch to the session you're already in" affordance.

If both regions are empty (e.g. fresh browser, no snapshots yet), each shows a single-line placeholder ("No snapshots yet — one is taken every 60 seconds while you type." / "No other sessions.") and the modal stays open.

## Data model

`localStorage` keys:

| Key | Type | Purpose |
| --- | --- | --- |
| `history-sessions` | `SessionMeta[]` (was `string[]`) | Session index. |
| `history-editorContent-<sessionId>` | `string` | Current content for that session. |
| `history-snapshots-<sessionId>` | `Snapshot[]` | Snapshots, 60-s cadence, 50-cap. |

```ts
type SessionMeta = { id: string; lastModified: number }   // epoch ms
type Snapshot   = { content: string; timestamp: string }   // ISO 8601
```

`lastModified` is updated on every non-empty `storeEditorContent`. It's the sort key for "Other sessions" (most recent first).

### Migration sweep (on every load — idempotent)

1. Read `history-sessions`. If any entry is a bare string, convert to `{ id, lastModified: 0 }`.
2. For each entry, check the session's stored content + snapshots:
   - If `history-editorContent-<id>` is missing/empty *and* `history-snapshots-<id>` is empty/missing → drop the entry and remove its keys. This purges the empty shells left behind by the current eager-registration behaviour.
   - Else keep; if `lastModified === 0`, backfill from the most recent snapshot's timestamp (parsed) or 0 if none.
3. Write the cleaned `SessionMeta[]` back.

Every check is wrapped in try/catch so one corrupt entry doesn't poison the sweep.

### Empty-shell guard going forward

Session registration moves from the `HistoryService` constructor to the first non-empty `storeEditorContent` call. The constructor still assigns an id and writes `location.hash` (for refresh/bookmark stability within the same browser — note: localStorage is per-origin per-browser, so the hash is **not** cross-user shareable), but `history-sessions` isn't touched until there's content worth remembering.

### Label derivation (no storage, pure function)

```ts
function deriveLabel(content: string): string
```

Returns the first line of `content` that is **not**:

- blank,
- a `package` declaration,
- an `import` statement (incl. `import static`),
- a `//` line comment,
- a block-comment line (starts with `/*`, `*`, or `*/`).

Truncated to 40 characters with a trailing `…`. Fallback when nothing matches: `"Untitled session"`.

### Hover preview (no storage, pure function)

`derivePreview(content)`: first 15 non-empty lines, each truncated to 80 chars, joined with `\n`, with a trailing `\n…` if the source had more lines. Rendered via the existing `@creativebulma/bulma-tooltip` dependency: each row carries `data-tooltip` + `has-tooltip-multiline`. Set via `element.dataset.tooltip` (text-safe — preserves angle brackets, quotes, line breaks; no HTML injection).

## `HistoryService` API

Unchanged signatures: `storeEditorContent`, `getEditorContent`, `getSnapshots`, `clearCurrentSession`.

| Method | Notes |
| --- | --- |
| `storeEditorContent(content)` | Updates `lastModified`; registers session in `history-sessions` on first non-empty call. |
| `clearAllSessions()` | Tightened: deletes only keys belonging to known sessions plus the index, no longer blanket-removes any `history-`-prefixed key. |

New:

```ts
getCurrentSessionId(): string
getOtherSessions(): SessionMeta[]              // sorted by lastModified desc, current excluded
getSessionContent(sessionId: string): string   // for label + preview of another session

deleteSession(sessionId: string): void         // removes content + snapshots + index entry
switchToSession(sessionId: string): void       // navigates to `pathname#sessionId` (no query),
                                               // forcing a reload; query params are stripped
                                               // so `loadFromUrl` doesn't override the session.
createNewSession(): void                       // navigates to `pathname` (no hash, no query),
                                               // same behaviour as the "New Session" link.

snapshotNow(): void                            // forces a snapshot of lastSavedContent;
                                               // bypasses the 60 s guard; no-op if empty.
restoreSnapshot(snapshot: Snapshot): string    // snapshotNow() + updates lastSavedContent
                                               // + persists; returns the chosen content.
```

The service stays a pure persistence layer — no DOM, no editor reference. The modal owns orchestration:

```ts
codeCM.setCode(historyService.restoreSnapshot(snapshot))
```

## Modal implementation

**New file**: `services/frontend/src/ts/history-modal.ts` — exports `HistoryModal` with `open()` and `close()`.

**HTML template**: hidden `modal` block added to `services/frontend/src/templates/index.html` with empty containers (`#historyCurrentSnapshots`, `#historyOtherSessions`, `#historyToasts`) the class populates on `open()`.

**Dropdown markup change** (`index.html`):

```html
<div class="dropdown-content">
  <a id="openHistory" class="dropdown-item">Open History…</a>
  <a href="." class="dropdown-item">New Session</a>
</div>
```

**Row markup**:

```html
<div class="history-row has-tooltip-multiline has-tooltip-right" data-tooltip="…preview…">
  <span class="history-row-time">3 min ago</span>
  <span class="history-row-label">println hello world</span>
  <button class="button is-small is-light">Restore</button>   <!-- or Switch + 🗑 -->
</div>
```

**Timestamp formatter** (small helper, no library):
- < 60 s → "just now"
- < 60 min → "N min ago"
- same day → "Today HH:mm"
- yesterday → "Yesterday HH:mm"
- this year → "May 28, 14:11"
- older → "May 28 2024, 14:11"

**SCSS** added to `style.scss`: `.history-row` (flex, hover background), `.history-region` (max-height: 35vh; overflow-y: auto; bordered), `.history-toast` (margin-top: 0.5rem), `.history-row-label` (monospace, text-overflow ellipsis).

**Wiring in `view.ts`** (after existing setup):

```ts
const historyModal = new HistoryModal(codeCM.getHistoryService(), codeCM)
fromEvent(document.getElementById('openHistory'), 'click')
  .subscribe(() => historyModal.open())
fromEvent(document.getElementById('historyModalClose'), 'click')
  .subscribe(() => historyModal.close())
fromEvent(document.querySelector('#historyModal .modal-background'), 'click')
  .subscribe(() => historyModal.close())
document.addEventListener('keydown', e => { if (e.key === 'Escape') historyModal.close() })
```

`CodeEditor.getHistoryService()` is added (one line) so the modal shares the same instance the editor already constructed.

**Undo-aware deletion** (modal-owned): a `pendingDeletes: Map<sessionId, timeoutId>` keeps timers; clicking trash hides the row and adds a toast (`notification is-warning is-light`) with an Undo button. Timer fires `historyService.deleteSession` at 15 s; Undo clears the timer and restores the row. Closing the modal or firing `beforeunload` commits all pending deletes immediately. Switching sessions via the modal also commits before the reload.

## Error handling & edge cases

- **`QuotaExceededError`** on write → catch, log, show inline error in the modal; editor stays functional.
- **Corrupted JSON** in any `history-*` key → caught locally per key, treated as empty.
- **Concurrent tabs** → the modal listens to `window.addEventListener('storage', ...)` and re-renders the session list if `history-sessions` changes while open. Last-writer-wins on shared session keys (existing behaviour, unchanged).
- **Pending deletes on navigation** → committed (not auto-undone) on modal close, `beforeunload`, and before any modal-initiated reload (Switch / Clear all).
- **Restore of the byte-identical "now" snapshot** → still runs the safety-snapshot path. No-op visually; acceptable.
- **Label collisions** → multiple sessions can derive the same label; the timestamp differentiates them. No special handling.

## Testing

Cypress only (no unit framework). New file: `cypress/e2e/history.cy.ts`.

Specs (each `beforeEach` seeds `localStorage` via `cy.window()` so we don't have to wait 60 s):

1. Modal open/close (delete button, modal-background, Esc).
2. Current-session header label skips imports/comments to find the first real line.
3. Snapshots region renders rows with expected labels and relative-time strings.
4. Restore loads the snapshot into the editor and creates a safety snapshot of the pre-restore content.
5. Other-sessions list sorted by `lastModified` desc; current session is absent.
6. Switch updates hash, reloads, editor shows that session's content.
7. Delete row → toast appears → Undo within 15 s restores it; entry remains in localStorage.
8. Delete row → close modal before 15 s → row stays gone, entry removed.
9. Clear all sessions: confirm dialog → accept → all known `history-*` keys removed.
10. Empty states render placeholders.
11. Migration sweep upgrades old `string[]` entries.
12. Migration sweep purges empty shells.
13. Tooltip preview contains the first 15 non-empty lines, truncated, with no HTML injection.
14. Label fallback "Untitled session" when content is only imports/comments.

New custom commands in `cypress/support/commands.ts`:

```ts
cy.seedHistorySession(id, content, opts?: { lastModified?, snapshots?, currentSession? })
cy.openHistoryModal()
```

## Files touched

- `services/frontend/src/ts/history.ts` — extend API, add migration, defer registration, add `lastModified`.
- `services/frontend/src/ts/history-modal.ts` — **new** (~200 lines).
- `services/frontend/src/ts/codemirror.ts` — expose `getHistoryService()`.
- `services/frontend/src/ts/view.ts` — wire modal open/close.
- `services/frontend/src/templates/index.html` — dropdown items + modal template.
- `services/frontend/src/resources/css/style.scss` — `.history-*` rules.
- `services/frontend/cypress/e2e/history.cy.ts` — **new**.
- `services/frontend/cypress/support/commands.ts` — new helpers.
