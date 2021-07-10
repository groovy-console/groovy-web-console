// ***********************************************************
// This example support/index.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

/// <reference types="cypress" />

// Import commands.ts using ES2015 syntax:
import './commands'

// Must be declared global to be detected by typescript (allows import/export)
declare global {
  // eslint-disable-next-line no-unused-vars
  namespace Cypress {
    // eslint-disable-next-line no-unused-vars
    interface Chainable<Subject = any> {
      /**
       * Asserts that the main CodeMirror editor has specific value.
       * @param expectedValue the expected value
       */
      assertCodeEditorValue(expectedValue: string):void

      /**
       * Sets the value of the main CodeMirror editor
       * @param newValue
       */
      setCodeEditorValue(newValue: string):void

      /**
       * Asserts that the output CodeMirror editor has specific value.
       * @param expectedValue the expected value
       */
      assertOutputEditorValue(expectedValue: string):void
      /**
       * Sets up a stub for the 'list_runtimes' network request.
       */
      stubListRuntimes(): void
      }
  }
}

// Convert this to a module instead of script (allows import/export)
export {}
