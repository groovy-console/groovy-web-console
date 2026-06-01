import { interceptIndefinitely } from '../support/utils'

describe('syntax highlighting', () => {
  beforeEach(() => {
    cy.stubListRuntimes()
    cy.visit('/')
    cy.wait(['@list_runtimes', '@warmup_request'])
  })

  it('highlights val and var like def', () => {
    cy.setCodeEditorValue('def a = 1\nval b = 2\nvar c = 3')
    
    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', 'def').invoke('attr', 'class').then(keywordClass => {
        cy.get('.cm-line').eq(1).contains('span', 'val').should('have.attr', 'class', keywordClass)
        cy.get('.cm-line').eq(2).contains('span', 'var').should('have.attr', 'class', keywordClass)
      })
    })
  })

  it('highlights async, await, defer as keywords', () => {
    cy.setCodeEditorValue('def a\nasync b\nawait c\ndefer d')
    
    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', 'def').invoke('attr', 'class').then(keywordClass => {
        cy.get('.cm-line').eq(1).contains('span', 'async').should('have.attr', 'class', keywordClass)
        cy.get('.cm-line').eq(2).contains('span', 'await').should('have.attr', 'class', keywordClass)
        cy.get('.cm-line').eq(3).contains('span', 'defer').should('have.attr', 'class', keywordClass)
      })
    })
  })

  it('highlights yield contextually', () => {
    cy.setCodeEditorValue('return a\nyield return b\nyield c')
    
    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', 'return').invoke('attr', 'class').then(returnClass => {
        // 'yield' on line 2 should have the keyword class
        cy.get('.cm-line').eq(1).contains('span', 'yield').should('have.attr', 'class', returnClass)
        
        // 'yield' on line 3 should not have the keyword class
        cy.get('.cm-line').eq(2).then($line => {
          const spans = $line.find('span')
          const yieldSpan = Array.from(spans).find(s => s.innerText === 'yield')
          if (yieldSpan) {
            expect(yieldSpan.className).not.to.eq(returnClass)
          } else {
            // Unstyled text means it correctly wasn't treated as a keyword
            expect(true).to.be.true
          }
        })
      })
    })
  })

  it('highlights module contextually', () => {
    cy.setCodeEditorValue('import a\nimport module b\nmodule c')
    
    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', 'import').invoke('attr', 'class').then(importClass => {
        // 'module' on line 2 should have the keyword class
        cy.get('.cm-line').eq(1).contains('span', 'module').should('have.attr', 'class', importClass)
        
        // 'module' on line 3 should not have the keyword class
        cy.get('.cm-line').eq(2).then($line => {
          const spans = $line.find('span')
          const moduleSpan = Array.from(spans).find(s => s.innerText === 'module')
          if (moduleSpan) {
            expect(moduleSpan.className).not.to.eq(importClass)
          } else {
            // Unstyled text
            expect(true).to.be.true
          }
        })
      })
    })
  })
})
