/// <reference types="cypress" />

const ACCESS = 'https://access.groovyconsole.dev'

describe('GitHub auth + gist save/update', () => {
  beforeEach(() => {
    cy.viewport(1280, 800)
    cy.stubListRuntimes()
  })

  describe('when not authenticated', () => {
    beforeEach(() => {
      cy.intercept('GET', `${ACCESS}/?action=me`, { statusCode: 401 }).as('me')
    })

    it('shows the Sign in item and hides save buttons', () => {
      cy.visit('/')
      cy.wait(['@warmup_request', '@me'])

      cy.get('#signInItem').should('be.visible')
      cy.get('#accountItem').should('not.be.visible')
      cy.get('#saveAsPublicGistControl').should('not.be.visible')
      cy.get('#saveAsSecretGistControl').should('not.be.visible')
      cy.get('#updateGistControl').should('not.be.visible')
      cy.get('#saveAsNewGistControl').should('not.be.visible')
    })
  })

  describe('when authenticated and no gist is loaded', () => {
    beforeEach(() => {
      cy.intercept('GET', `${ACCESS}/?action=me`, {
        statusCode: 200,
        body: { login: 'alice', avatar_url: 'data:image/png;base64,iVBORw0KGgo=' }
      }).as('me')
    })

    it('shows avatar + login and offers public + secret save buttons', () => {
      cy.visit('/')
      cy.wait(['@warmup_request', '@me'])

      cy.get('#signInItem').should('not.be.visible')
      cy.get('#accountItem').should('be.visible')
      cy.get('#accountLogin').should('have.text', '@alice')
      cy.get('#saveAsPublicGistControl').should('be.visible')
      cy.get('#saveAsSecretGistControl').should('be.visible')
      cy.get('#updateGistControl').should('not.be.visible')
      cy.get('#saveAsNewGistControl').should('not.be.visible')
    })

    it('opens the modal, posts a new gist, and updates the URL', () => {
      cy.intercept('POST', `${ACCESS}/?action=gist`, req => {
        expect(req.body).to.deep.include({ name: 'My Snippet', public: true })
        expect(req.body.code).to.be.a('string')
        req.reply({ statusCode: 200, body: { id: 'new123', public: true } })
      }).as('createGist')

      cy.visit('/')
      cy.wait(['@warmup_request', '@me'])

      cy.get('#saveAsPublicGist').click()
      cy.get('#saveGistModal').should('have.class', 'is-active')
      cy.get('#saveGistName').type('My Snippet')
      cy.get('#saveGistConfirm').click()

      cy.wait('@createGist')
      cy.location('search').should('include', 'gist=new123')
      cy.get('#saveGistModal').should('not.have.class', 'is-active')
    })

    it('shows a validation error when name is blank', () => {
      cy.visit('/')
      cy.wait(['@warmup_request', '@me'])

      cy.get('#saveAsSecretGist').click()
      cy.get('#saveGistConfirm').click()
      cy.get('#saveGistNameError').should('be.visible')
    })
  })

  describe('when authenticated and viewing an owned gist', () => {
    beforeEach(() => {
      cy.intercept('GET', `${ACCESS}/?action=me`, {
        statusCode: 200,
        body: { login: 'alice', avatar_url: 'data:image/png;base64,iVBORw0KGgo=' }
      }).as('me')

      cy.intercept('GET', 'https://api.github.com/gists/abc123', {
        statusCode: 200,
        body: {
          id: 'abc123',
          public: true,
          owner: { login: 'alice' },
          files: {
            'hello.groovy': {
              filename: 'hello.groovy',
              language: 'Groovy',
              truncated: false,
              content: 'println "hi"'
            }
          }
        }
      }).as('gist')
    })

    it('shows the Update gist + Save as new gist buttons', () => {
      cy.visit('/?gist=abc123')
      cy.wait(['@warmup_request', '@me', '@gist'])

      cy.get('#updateGistControl').should('be.visible')
      cy.get('#saveAsNewGistControl').should('be.visible')
      cy.get('#saveAsPublicGistControl').should('not.be.visible')
      cy.get('#saveAsSecretGistControl').should('not.be.visible')
    })

    it('PATCHes the existing gist when Update is clicked', () => {
      cy.intercept('PATCH', `${ACCESS}/?action=gist*`, req => {
        expect(req.body).to.deep.include({ filename: 'hello.groovy' })
        expect(req.body.code).to.be.a('string')
        req.reply({ statusCode: 200, body: { id: 'abc123' } })
      }).as('updateGist')

      cy.visit('/?gist=abc123')
      cy.wait(['@warmup_request', '@me', '@gist'])

      cy.get('#updateGist').click()
      cy.wait('@updateGist')
      cy.get('#saveGistModal').should('not.have.class', 'is-active')
    })
  })

  describe('private gist fallback', () => {
    beforeEach(() => {
      cy.intercept('GET', `${ACCESS}/?action=me`, {
        statusCode: 200,
        body: { login: 'alice', avatar_url: 'data:image/png;base64,iVBORw0KGgo=' }
      }).as('me')
    })

    it('retries through the proxy when the anonymous GitHub API returns 404', () => {
      cy.intercept('GET', 'https://api.github.com/gists/private1', { statusCode: 404 }).as('anonGist')
      cy.intercept('GET', `${ACCESS}/?action=gist&id=private1`, {
        statusCode: 200,
        body: {
          id: 'private1',
          filename: 'secret.groovy',
          code: 'println "private"',
          ownerLogin: 'alice',
          public: false
        }
      }).as('proxiedGist')

      cy.visit('/?gist=private1')
      cy.wait(['@warmup_request', '@me', '@anonGist', '@proxiedGist'])

      cy.assertCodeEditorValue('println "private"')
      cy.get('#updateGistControl').should('be.visible')
    })
  })
})
