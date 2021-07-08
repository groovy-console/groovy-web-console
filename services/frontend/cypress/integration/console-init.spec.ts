/// <reference types="cypress" />

describe('example to-do app', () => {
  beforeEach(() => {
    // Cypress starts out with a blank slate for each test
    // so we must tell it to visit our website with the `cy.visit()` command.
    // Since we want to visit the same URL at the start of all our tests,
    // we include it in our beforeEach function so that it runs before each test

    cy.intercept(
      {
        method: 'GET', // Route all GET requests
        url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/list_runtimes' // that have a URL that matches '/users/*'
      },
      [
        'groovy_2_5',
        'groovy_3_0',
        'groovy_4_0_alpha3'
      ]
    )

    cy.visit('/')
  })

  it('displays available groovy versions', () => {
    // We use the `cy.get()` command to get all elements that match the selector.
    // Then, we use `should` to assert that there are two matched items,
    // which are the two default items.
    // cy.server()
    // cy.route('https://europe-west1-gwc-experiment.cloudfunctions.net/list_runtimes')

    cy.get('#version option').should('have.length', 3)
  })
})
