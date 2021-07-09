/// <reference types="cypress" />

describe('groovy webconsole', () => {
  beforeEach(() => {
    // The webconsole requests a list of current available runtimes on startup,
    // so we mock this request here to have a reliable set of versions
    cy.stubListRuntimes()
  })

  it('displays available groovy versions', () => {
    cy.visit('/')

    // We use the `cy.get()` command to get all elements that match the selector.
    // Then, we use `should` to assert that there are three matched items
    cy.get('#version option').should('have.length', 3)
  })

  it('can load initial editor content from "code" parameter', () => {
    cy.visit('/?code=cHJpbnRsbiAiaGVsbG8gd29ybGQi')

    cy.assertCodeEditorValue('println "hello world"')
  })

  it('can load initial editor content from "codez" parameter', () => {
    cy.visit('/?codez=eJwrKMrMK8nJU1DKSM3JyVcozy_KSVECAFiSB8g')

    cy.assertCodeEditorValue('println "hello world"')
  })
})
