/// <reference types="cypress" />

const CURRENT = 'curSess001'
const OTHER_A = 'otherSes0A'
const OTHER_B = 'otherSes0B'
const OTHER_C = 'otherSes0C'

const isoMinutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

const clearHistoryStorage = (win: Window) => {
  Object.keys(win.localStorage)
    .filter(k => k.startsWith('history-'))
    .forEach(k => win.localStorage.removeItem(k))
}

describe('groovy webconsole history', () => {
  beforeEach(() => {
    cy.stubListRuntimes()
    // We visit a known fragment so the freshly-loaded HistoryService treats CURRENT as the current session.
    // Tests that don't care still get a deterministic id.
    cy.visit(`/#${CURRENT}`, {
      onBeforeLoad (win) {
        clearHistoryStorage(win)
      }
    })
    cy.wait(['@list_runtimes', '@warmup_request'])
  })

  describe('modal', () => {
    it('opens via the "Open History…" menu item and closes via the X', () => {
      cy.get('#historyModal').should('not.have.class', 'is-active')
      cy.openHistoryModal()
      cy.get('#historyModalClose').click()
      cy.get('#historyModal').should('not.have.class', 'is-active')
    })

    it('closes when clicking the modal background', () => {
      cy.openHistoryModal()
      cy.get('#historyModal .modal-background').click({ force: true })
      cy.get('#historyModal').should('not.have.class', 'is-active')
    })

    it('closes when pressing Escape', () => {
      cy.openHistoryModal()
      cy.get('body').type('{esc}')
      cy.get('#historyModal').should('not.have.class', 'is-active')
    })
  })

  describe('current session header', () => {
    it('derives the label from the first non-blank, non-import, non-comment line', () => {
      const script = [
        '',
        'package com.example',
        '// a comment',
        '/* block',
        ' * comment */',
        'import groovy.transform.*',
        'import static java.util.Collections.*',
        '',
        'println "hello world"',
        'def x = 1'
      ].join('\n')
      cy.seedHistorySession(CURRENT, script, { currentSession: true })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyCurrentLabel').should('contain.text', 'println "hello world"')
    })

    it('falls back to "Untitled session" when content has only imports/comments', () => {
      cy.seedHistorySession(CURRENT, '// just a comment\nimport foo.Bar\n', { currentSession: true })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyCurrentLabel').should('contain.text', 'Untitled session')
    })
  })

  describe('snapshots region', () => {
    it('lists snapshots of the current session', () => {
      cy.seedHistorySession(CURRENT, 'def latest = 1', {
        currentSession: true,
        snapshots: [
          { content: 'def first = 1', timestamp: isoMinutesAgo(45) },
          { content: 'def second = 2', timestamp: isoMinutesAgo(15) }
        ]
      })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyCurrentSnapshots .history-row').should('have.length', 2)
      cy.get('#historyCurrentSnapshots .history-row').eq(0).should('contain.text', 'def first = 1')
      cy.get('#historyCurrentSnapshots .history-row').eq(1).should('contain.text', 'def second = 2')
    })

    it('shows a placeholder when there are no snapshots', () => {
      cy.openHistoryModal()
      cy.get('#historyCurrentSnapshots').should('contain.text', 'No snapshots yet')
    })

    it('restores a snapshot into the editor and preserves the pre-restore content as a safety snapshot', () => {
      cy.seedHistorySession(CURRENT, 'def working = "now"', {
        currentSession: true,
        snapshots: [
          { content: 'def older = "long ago"', timestamp: isoMinutesAgo(30) }
        ]
      })
      cy.reload()
      cy.wait('@warmup_request')

      cy.assertCodeEditorValue('def working = "now"')

      cy.openHistoryModal()
      cy.get('#historyCurrentSnapshots .history-row').contains('Restore').click()

      cy.assertCodeEditorValue('def older = "long ago"')
      cy.window().then((win) => {
        const snapshots = JSON.parse(win.localStorage.getItem(`history-snapshots-${CURRENT}`) || '[]')
        const contents: string[] = snapshots.map((s: any) => s.content)
        expect(contents).to.include('def working = "now"')
      })
    })
  })

  describe('other sessions region', () => {
    it('lists other sessions sorted by lastModified desc, excluding the current one', () => {
      cy.seedHistorySession(CURRENT, 'current', { currentSession: true })
      cy.seedHistorySession(OTHER_A, 'older script', { lastModified: Date.now() - 60 * 60_000 })
      cy.seedHistorySession(OTHER_B, 'newer script', { lastModified: Date.now() - 2 * 60_000 })
      cy.seedHistorySession(OTHER_C, 'middle script', { lastModified: Date.now() - 30 * 60_000 })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyOtherSessions .history-row').should('have.length', 3)
      cy.get('#historyOtherSessions .history-row').eq(0).should('contain.text', 'newer script')
      cy.get('#historyOtherSessions .history-row').eq(1).should('contain.text', 'middle script')
      cy.get('#historyOtherSessions .history-row').eq(2).should('contain.text', 'older script')
      cy.get('#historyOtherSessions').should('not.contain.text', 'current')
    })

    it('shows a placeholder when there are no other sessions', () => {
      cy.openHistoryModal()
      cy.get('#historyOtherSessions').should('contain.text', 'No other sessions')
    })

    it('switches to another session via the Switch button (URL hash updates)', () => {
      cy.seedHistorySession(CURRENT, 'current', { currentSession: true })
      cy.seedHistorySession(OTHER_A, 'other script content', { lastModified: Date.now() - 10 * 60_000 })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyOtherSessions .history-row').contains('Switch').click()
      cy.wait('@warmup_request')

      cy.location('hash').should('eq', `#${OTHER_A}`)
      cy.assertCodeEditorValue('other script content')
    })
  })

  describe('delete + undo', () => {
    it('hides the row and shows a toast on delete; Undo restores it', () => {
      cy.seedHistorySession(CURRENT, 'current', { currentSession: true })
      cy.seedHistorySession(OTHER_A, 'will be kept', { lastModified: Date.now() - 10 * 60_000 })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyOtherSessions .history-row').find('.delete-session').click()
      cy.get('#historyOtherSessions .history-row').should('have.length', 0)
      cy.get('.history-toast').should('be.visible').contains('Undo').click()
      cy.get('#historyOtherSessions .history-row').should('have.length', 1)

      cy.window().then(win => {
        const sessions = JSON.parse(win.localStorage.getItem('history-sessions') || '[]')
        expect(sessions.map((s: any) => s.id)).to.include(OTHER_A)
      })
    })

    it('commits the delete when the modal closes while the toast is still up', () => {
      cy.seedHistorySession(CURRENT, 'current', { currentSession: true })
      cy.seedHistorySession(OTHER_A, 'will be deleted', { lastModified: Date.now() - 10 * 60_000 })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyOtherSessions .history-row').find('.delete-session').click()
      cy.get('#historyModalClose').click()

      cy.window().then(win => {
        const sessions = JSON.parse(win.localStorage.getItem('history-sessions') || '[]')
        expect(sessions.map((s: any) => s.id)).to.not.include(OTHER_A)
        expect(win.localStorage.getItem(`history-editorContent-${OTHER_A}`)).to.equal(null)
      })
    })
  })

  describe('clear all sessions', () => {
    it('removes every known session\'s storage after confirmation', () => {
      cy.seedHistorySession(CURRENT, 'current', { currentSession: true })
      cy.seedHistorySession(OTHER_A, 'a', { lastModified: Date.now() - 10 * 60_000 })
      cy.seedHistorySession(OTHER_B, 'b', { lastModified: Date.now() - 20 * 60_000 })
      cy.reload()
      cy.wait('@warmup_request')

      cy.on('window:confirm', () => true)

      cy.openHistoryModal()
      cy.get('#historyClearAll').click()

      cy.window().then(win => {
        expect(win.localStorage.getItem('history-sessions')).to.satisfy((v: string | null) => v === null || v === '[]')
        expect(win.localStorage.getItem(`history-editorContent-${OTHER_A}`)).to.equal(null)
        expect(win.localStorage.getItem(`history-editorContent-${OTHER_B}`)).to.equal(null)
      })
    })
  })

  describe('migration', () => {
    it('upgrades old string[] history-sessions to SessionMeta[] and purges empty shells', () => {
      cy.window().then(win => {
        clearHistoryStorage(win)
        // Old shape: array of plain strings
        win.localStorage.setItem('history-sessions', JSON.stringify([CURRENT, OTHER_A, OTHER_B]))
        // CURRENT has content
        win.localStorage.setItem(`history-editorContent-${CURRENT}`, 'has content')
        // OTHER_A is an empty shell (no content, no snapshots) — should be purged
        win.localStorage.setItem(`history-editorContent-${OTHER_A}`, '')
        // OTHER_B has content
        win.localStorage.setItem(`history-editorContent-${OTHER_B}`, 'b content')
      })
      cy.reload()
      cy.wait('@warmup_request')

      cy.window().then(win => {
        const raw = win.localStorage.getItem('history-sessions') || '[]'
        const sessions = JSON.parse(raw)
        expect(sessions).to.have.length(2)
        sessions.forEach((s: any) => {
          expect(s).to.have.property('id')
          expect(s).to.have.property('lastModified')
        })
        const ids = sessions.map((s: any) => s.id)
        expect(ids).to.include(CURRENT)
        expect(ids).to.include(OTHER_B)
        expect(ids).to.not.include(OTHER_A)
        // empty shell keys are gone
        expect(win.localStorage.getItem(`history-editorContent-${OTHER_A}`)).to.equal(null)
      })
    })
  })

  describe('empty-shell guard', () => {
    it('does not register a new session in history-sessions until content is saved', () => {
      // Fresh visit, no fragment — service generates a new id but should NOT add it to history-sessions yet.
      cy.visit('/', {
        onBeforeLoad (win) {
          clearHistoryStorage(win)
        }
      })
      cy.wait('@warmup_request')

      cy.window().then(win => {
        const raw = win.localStorage.getItem('history-sessions')
        const sessions = raw ? JSON.parse(raw) : []
        expect(sessions).to.have.length(0)
      })
    })
  })

  describe('preview pane', () => {
    it('shows a placeholder until a row is hovered, then the row content, and keeps it after mouseleave', () => {
      cy.seedHistorySession(CURRENT, 'current', { currentSession: true })
      cy.seedHistorySession(OTHER_A, 'def hello = "world"\nprintln hello', { lastModified: Date.now() - 5 * 60_000 })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyPreview').should('contain.text', 'Hover a row to preview')

      cy.get('#historyOtherSessions .history-row').first().trigger('mouseenter')
      cy.get('#historyPreview')
        .should('contain.text', 'def hello = "world"')
        .and('contain.text', 'println hello')

      // After mouseleave, preview stays
      cy.get('#historyOtherSessions .history-row').first().trigger('mouseleave')
      cy.get('#historyPreview').should('contain.text', 'def hello = "world"')
    })

    it('renders untrusted content as text, not HTML', () => {
      const script = 'def evil = "<script>x</script>"\nprintln evil'
      cy.seedHistorySession(OTHER_A, script, { lastModified: Date.now() - 5 * 60_000 })
      cy.seedHistorySession(CURRENT, 'current', { currentSession: true })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyOtherSessions .history-row').first().trigger('mouseenter')
      // textContent shows the literal characters; no real <script> element gets injected
      cy.get('#historyPreview').should('contain.text', '<script>x</script>')
      cy.get('#historyPreview script').should('not.exist')
    })
  })

  describe('formatting', () => {
    it('renders unknown timestamps as an em dash', () => {
      cy.seedHistorySession(CURRENT, 'current', { currentSession: true })
      cy.seedHistorySession(OTHER_A, 'older content', { lastModified: 0 })
      cy.reload()
      cy.wait('@warmup_request')

      cy.openHistoryModal()
      cy.get('#historyOtherSessions .history-row').first()
        .find('.history-row-time')
        .should('have.text', '—')
    })
  })
})
