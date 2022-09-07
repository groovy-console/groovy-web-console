/// <reference types="cypress" />

import { interceptIndefinitely } from '../support/utils'

describe('groovy webconsole', () => {
  it('displays a loading indicator while', () => {
    const response = interceptIndefinitely({
      method: 'GET',
      url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/list_runtimes'
    },
    { fixture: 'list_runtimes.json' }
    , 'list_runtimes')

    cy.visit('/')

    cy.get('#version option').should('have.length', 1)
    cy.get('#version').parent().should('have.class', 'is-loading')
      .then(() => {
        response.sendResponse()
        cy.wait(`@${response.alias}`)
      })
      .get('#version').parent().should('not.have.class', 'is-loading')
      .get('#version option').should('have.length', 3)
  })
  describe('initial values', () => {
    beforeEach(() => {
      // The webconsole requests a list of current available runtimes on startup,
      // so we mock this request here to have a reliable set of versions
      cy.stubListRuntimes()
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
    });

    ['2_5', '3_0', '4_0'].forEach(version => {
      it(`can set groovy version via "g" parameter for "groovy_${version}"`, () => {
        cy.visit(`/?g=groovy_${version}`)

        cy.wait('@warmup_request')

        cy.get('#version').should('have.value', `groovy_${version}`)
      })
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
})
