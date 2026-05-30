// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })

// If you add a command here you also need to add the signature to ./index.ts so that typescript can verify it

import { EditorView } from '@codemirror/view'

Cypress.Commands.add('assertCodeEditorValue', (expectedValue) => {
  cy.get('#code .cm-content')
    .should((editor:any) => {
      const cm = editor[0].cmView.view as EditorView
      expect(cm.state.doc.toString()).to.eq(expectedValue)
    })
})

Cypress.Commands.add('setCodeEditorValue', (newValue) => {
  cy.get('#code .cm-content')
    .then((editor:any) => {
      const cm = editor[0].cmView.view as EditorView
      cm.dispatch({
        changes: { from: 0, to: cm.state.doc.length, insert: newValue }
      })
    })
})

Cypress.Commands.add('assertOutputEditorValue', (expectedValue) => {
  cy.get('#output .cm-content')
    .should((editor:any) => {
      const cm = editor[0].cmView.view as EditorView
      expect(cm.state.doc.toString()).to.eq(expectedValue)
    })
})

Cypress.Commands.add('assertTabActive', (tabId) => {
  cy.get(`#${tabId}`)
    .parent()
    .should('have.class', 'is-active')
})

Cypress.Commands.add('stubListRuntimes', () => {
  cy.intercept(
    {
      method: 'GET',
      url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/list_runtimes'
    },
    { fixture: 'list_runtimes.json' }
  ).as('list_runtimes') // with this alias we can later refer to this mock

  // the webconsole sends a warmup request to the selected function
  cy.intercept(
    {
      method: 'GET',
      url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/groovy_*'
    },
    ''
  ).as('warmup_request')
})

Cypress.Commands.add('seedHistorySession', (id, content, opts = {}) => {
  const lastModified = opts.lastModified ?? Date.now()
  const snapshots = opts.snapshots ?? []

  cy.window().then((win) => {
    const raw = win.localStorage.getItem('history-sessions')
    const sessions: Array<{ id: string, lastModified: number }> = raw ? JSON.parse(raw) : []
    if (!sessions.some(s => s.id === id)) {
      sessions.push({ id, lastModified })
    } else {
      sessions.forEach(s => { if (s.id === id) s.lastModified = lastModified })
    }
    win.localStorage.setItem('history-sessions', JSON.stringify(sessions))
    win.localStorage.setItem(`history-editorContent-${id}`, content)
    if (snapshots.length > 0) {
      win.localStorage.setItem(`history-snapshots-${id}`, JSON.stringify(snapshots))
    }
    if (opts.currentSession) {
      win.location.hash = id
    }
  })
})

Cypress.Commands.add('openHistoryModal', () => {
  cy.get('#dropdown-history').parent().find('.dropdown-trigger button').click()
  cy.get('#openHistory').click()
  cy.get('#historyModal').should('have.class', 'is-active')
})
