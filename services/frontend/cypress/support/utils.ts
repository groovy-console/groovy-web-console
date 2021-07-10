import { HttpResponseInterceptor, RouteMatcher, StaticResponse } from 'cypress/types/net-stubbing'

/**
 * Creates an interception that blocks until the sendResponse promise is resolved.
 * @param requestMatcher the request matcher, same as cy.intercept
 * @param response optional - the response to return
 * @param alias optional - the alias to use, if undefined an alias will be generated
 */
// this function was adapted from https://blog.dai.codes/cypress-loading-state-tests/
export function interceptIndefinitely (
  requestMatcher: RouteMatcher,
  response?: StaticResponse | HttpResponseInterceptor,
  alias?: string
): { sendResponse: () => void, alias: string } {
  let sendResponse
  const trigger = new Cypress.Promise((resolve) => {
    sendResponse = resolve
  })

  if (alias === undefined) {
    alias = 'req_' + new Date()
  }

  cy.intercept(requestMatcher, (request) => {
    return trigger.then(() => {
      request.reply(response)
    })
  }).as(alias)

  return {
    sendResponse,
    alias
  }
}
