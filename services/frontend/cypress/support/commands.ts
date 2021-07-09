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
Cypress.Commands.add('assertCodeEditorValue', (expectedValue) => {
  cy.get('#code + .CodeMirror')
    .then((editor:any) => {
      expect(editor[0].CodeMirror.getValue()).to.eq(expectedValue)
    })
})
Cypress.Commands.add('stubListRuntimes', () => {
  cy.intercept(
    {
      method: 'GET', // Route all GET requests
      url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/list_runtimes' // that have a URL that matches '/users/*'
    },
    { fixture: 'list_runtimes.json' }
  ).as('list_runtimes') // with this alias we can later refer to this mock
})
