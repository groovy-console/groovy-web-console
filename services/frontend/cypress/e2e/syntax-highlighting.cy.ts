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
            expect(true).to.equal(true)
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
            expect(true).to.equal(true)
          }
        })
      })
    })
  })

  it('highlights sealed, non-sealed, permits, and record as keywords', () => {
    cy.setCodeEditorValue('sealed class A permits B {}\nnon-sealed class B extends A {}\nrecord R(int x) {}\nnon - sealed')

    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', 'class').invoke('attr', 'class').then(keywordClass => {
        cy.get('.cm-line').eq(0).contains('span', 'sealed').should('have.attr', 'class', keywordClass)
        cy.get('.cm-line').eq(0).contains('span', 'permits').should('have.attr', 'class', keywordClass)
        cy.get('.cm-line').eq(1).contains('span', 'non-sealed').should('have.attr', 'class', keywordClass)
        cy.get('.cm-line').eq(2).contains('span', 'record').should('have.attr', 'class', keywordClass)

        // 'non' on line 4 (with spaces around '-') should not have the keyword class
        cy.get('.cm-line').eq(3).then($line => {
          const spans = $line.find('span')
          const nonSpan = Array.from(spans).find(s => s.innerText === 'non')
          if (nonSpan) {
            expect(nonSpan.className).not.to.eq(keywordClass)
          } else {
            expect(true).to.equal(true)
          }
        })
      })
    })
  })

  it('highlights DO, GQ, and GQL macros contextually', () => {
    cy.setCodeEditorValue('def a\nDO(x in opt) {}\nGQ {}\nGQL {}\ndef DO = 1\nGQ = 2')

    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', 'def').invoke('attr', 'class').then(keywordClass => {
        cy.get('.cm-line').eq(1).contains('span', 'DO').should('have.attr', 'class', keywordClass)
        cy.get('.cm-line').eq(2).contains('span', 'GQ').should('have.attr', 'class', keywordClass)
        cy.get('.cm-line').eq(3).contains('span', 'GQL').should('have.attr', 'class', keywordClass)

        // 'DO' on line 5 and 'GQ' on line 6 should not have the keyword class
        cy.get('.cm-line').eq(4).then($line => {
          const spans = $line.find('span')
          const doSpan = Array.from(spans).find(s => s.innerText === 'DO')
          if (doSpan) {
            expect(doSpan.className).not.to.eq(keywordClass)
          } else {
            expect(true).to.equal(true)
          }
        })
        cy.get('.cm-line').eq(5).then($line => {
          const spans = $line.find('span')
          const gqSpan = Array.from(spans).find(s => s.innerText === 'GQ')
          if (gqSpan) {
            expect(gqSpan.className).not.to.eq(keywordClass)
          } else {
            expect(true).to.equal(true)
          }
        })
      })
    })
  })

  it('highlights underscored, hex, binary, suffixed numbers and ranges', () => {
    cy.setCodeEditorValue('42\n1_000\n0xFF_00\n0b1010_0101\n42G\n1..1_000\n1..<10')

    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', '42').invoke('attr', 'class').then(numberClass => {
        cy.get('.cm-line').eq(1).contains('span', '1_000').should('have.attr', 'class', numberClass)
        cy.get('.cm-line').eq(2).contains('span', '0xFF_00').should('have.attr', 'class', numberClass)
        cy.get('.cm-line').eq(3).contains('span', '0b1010_0101').should('have.attr', 'class', numberClass)
        cy.get('.cm-line').eq(4).contains('span', '42G').should('have.attr', 'class', numberClass)
        cy.get('.cm-line').eq(5).contains('span', '1').should('have.attr', 'class', numberClass)
        cy.get('.cm-line').eq(5).contains('span', '1_000').should('have.attr', 'class', numberClass)
        cy.get('.cm-line').eq(6).contains('span', '1').should('have.attr', 'class', numberClass)
        cy.get('.cm-line').eq(6).contains('span', '10').should('have.attr', 'class', numberClass)
      })
    })
  })

  it('highlights XOR, compound assignment, and range operators like standard operators', () => {
    cy.setCodeEditorValue('a += b\na ^= b\na ^ b\na **= b\n1..10\n1..<10')

    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', '+=').invoke('attr', 'class').then(operatorClass => {
        cy.get('.cm-line').eq(1).contains('span', '^=').should('have.attr', 'class', operatorClass)
        cy.get('.cm-line').eq(2).contains('span', '^').should('have.attr', 'class', operatorClass)
        cy.get('.cm-line').eq(3).contains('span', '**=').should('have.attr', 'class', operatorClass)
        cy.get('.cm-line').eq(4).contains('span', '..').should('have.attr', 'class', operatorClass)
        cy.get('.cm-line').eq(5).contains('span', '..<').should('have.attr', 'class', operatorClass)
      })
    })
  })

  it('treats map-style destructuring keys as property labels rather than keywords', () => {
    cy.setCodeEditorValue('val x = 1\ndef (val: v, async: a) = person')

    cy.get('#code .cm-content').within(() => {
      cy.get('.cm-line').eq(0).contains('span', 'val').invoke('attr', 'class').then(keywordClass => {
        cy.get('.cm-line').eq(1).then($line => {
          const spans = $line.find('span')
          const valKeySpan = Array.from(spans).find(s => s.innerText.startsWith('val'))
          const asyncKeySpan = Array.from(spans).find(s => s.innerText.startsWith('async'))
          if (valKeySpan) {
            expect(valKeySpan.className).not.to.eq(keywordClass)
          }
          if (asyncKeySpan) {
            expect(asyncKeySpan.className).not.to.eq(keywordClass)
          }
          // 'def' on line 2 should still have the keyword class
          cy.wrap($line).contains('span', 'def').should('have.attr', 'class', keywordClass)
        })
      })
    })
  })
})
