import { interceptIndefinitely } from '../support/utils'

describe('groovy webconsole', () => {
  beforeEach(() => {
    // The webconsole requests a list of current available runtimes on startup,
    // so we mock this request here to have a reliable set of versions
    cy.stubListRuntimes()
    cy.visit('/')
    cy.wait(['@list_runtimes', '@warmup_request'])
  })

  it('can set and read editor contents', () => {
    cy.setCodeEditorValue('println "hello world"')
    cy.assertCodeEditorValue('println "hello world"')
  })

  it('can save editor contents', () => {
    cy.setCodeEditorValue('println "hello world"')

    cy.get('#shareLink')
      .should('not.be.visible')

    cy.get('#share')
      .click()

    cy.get('#shareLink')
      .should('be.visible')
      .should('have.value', 'http://localhost:9000/?codez=eJwrKMrMK8nJU1DKSM3JyVcozy_KSVECAFiSB8g')
  })

  it('can execute groovy script', () => {
    cy.setCodeEditorValue('println "hello world"')

    cy.intercept(
      {
        method: 'POST',
        url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/groovy_2_5'
      },
      { fixture: 'execute_hello_world_2_5.json' }
    ).as('execute_hello_world_2_5') // with this alias we can later refer to this mock

    cy.get('#execute')
      .click()

    cy.wait('@execute_hello_world_2_5')

    cy.assertTabActive('tabOutput')

    cy.assertOutputEditorValue('hello world\n')
  })

  it('can display error response when executing groovy script', () => {
    cy.setCodeEditorValue('println "hello world')

    cy.intercept(
      {
        method: 'POST',
        url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/groovy_2_5'
      },
      { fixture: 'execute_hello_world_2_5_error.json' }
    ).as('execute_hello_world_2_5') // with this alias we can later refer to this mock

    cy.get('#execute')
      .click()

    cy.wait('@execute_hello_world_2_5')

    cy.assertTabActive('tabError')

    cy.assertOutputEditorValue('unexpected char: 0xFFFF @ line 1, column 21.')
  })

  it('can execute spock test and render results', () => {
    cy.setCodeEditorValue('import spock.lang.*\n\nclass ASpec extends Specification {\n  def "hello world"() {\n    expect: true\n  }\n}\n')

    cy.intercept(
      {
        method: 'POST',
        url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/groovy_2_5'
      },
      { fixture: 'execute_hello_world_2_5_spock.json' }
    ).as('execute_hello_world_2_5') // with this alias we can later refer to this mock

    cy.get('#execute')
      .click()

    cy.wait('@execute_hello_world_2_5')

    cy.assertTabActive('tabResult')

    cy.assertOutputEditorValue('╷\n└─ Spock ✔\n   └─ ASpec ✔\n      └─ hello world ✔\n')
  })

  it('displays loading spinner when executing code', () => {
    cy.setCodeEditorValue('println "hello world"')

    const response = interceptIndefinitely(
      {
        method: 'POST',
        url: 'https://europe-west1-gwc-experiment.cloudfunctions.net/groovy_2_5'
      },
      { fixture: 'execute_hello_world_2_5.json' },
      'execute_hello_world_2_5')

    cy.get('#execute')
      .should('not.have.class', 'is-loading') // should not display loading initially
      .click()
      .should('have.class', 'is-loading') // should display loading after click on execute
      .then(() => {
        response.sendResponse() // let the network request complete
        cy.wait(`@${response.alias}`)
      })
      .get('#execute') // we need to select the element again
      .should('not.have.class', 'is-loading') // loading indicator should be gone
  })
})
