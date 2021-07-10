/// <reference types="cypress" />

describe('groovy webconsole', () => {
  beforeEach(() => {
    // The webconsole requests a list of current available runtimes on startup,
    // so we mock this request here to have a reliable set of versions
    cy.stubListRuntimes()
  })

  it('displays available groovy versions', () => {
    cy.visit('/')

    cy.wait(['@list_runtimes', '@warmup_request'])

    // We use the `cy.get()` command to get all elements that match the selector.
    // Then, we use `should` to assert that there are three matched items
    cy.get('#version option').should('have.length', 3)
  })

  it('can load initial editor content from "code" parameter', () => {
    cy.visit('/?code=cHJpbnRsbiAiaGVsbG8gd29ybGQi')

    cy.wait('@warmup_request')

    cy.assertCodeEditorValue('println "hello world"')
  })

  it('can load initial editor content from "codez" parameter', () => {
    cy.visit('/?codez=eJwrKMrMK8nJU1DKSM3JyVcozy_KSVECAFiSB8g')

    cy.wait('@warmup_request')

    cy.assertCodeEditorValue('println "hello world"')
  })

  it('can load initial editor content from "gist" parameter', () => {
    cy.intercept({
      method: 'GET',
      url: 'https://api.github.com/gists/58f61cf36e112ff654041eeec8d11a98'
    }, { fixture: 'gist-58f61' }).as('gist')

    cy.visit('/?gist=58f61cf36e112ff654041eeec8d11a98')

    // wait for the mocked request to respond
    cy.wait(['@warmup_request', '@gist'])

    cy.assertCodeEditorValue('import spock.lang.*\n\nclass ASpec extends Specification {\n  def "hello world"() {\n    expect: true\n  }\n}\n')
  })

  it('can load initial editor content from "github" parameter', () => {
    cy.intercept({
      method: 'GET',
      url: 'https://rawcdn.githack.com/spockframework/spock/6d2e6cc6475346f2fef256124e37f70514f0b98e/spock-specs/src/test/groovy/org/spockframework/docs/datadriven/v7/MathSpec.groovy'
    }, 'println "hello world"').as('github')

    cy.visit('/?github=spockframework/spock/blob/6d2e6cc6475346f2fef256124e37f70514f0b98e/spock-specs/src/test/groovy/org/spockframework/docs/datadriven/v7/MathSpec.groovy')

    // wait for the mocked request to respond
    cy.wait(['@warmup_request', '@github'])

    cy.assertCodeEditorValue('println "hello world"')
  })
})
