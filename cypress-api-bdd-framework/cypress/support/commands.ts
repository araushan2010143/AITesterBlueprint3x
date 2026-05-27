import { BookingPayload } from '../../src/models/bookingPayload'

declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
      apiRequest(options: Partial<Cypress.RequestOptions>): Chainable<Cypress.Response<any>>
      createBooking(payload: BookingPayload): Chainable<Cypress.Response<any>>
      getBooking(bookingId: number): Chainable<Cypress.Response<any>>
    }
  }
}

Cypress.Commands.add('apiRequest', (options: Partial<Cypress.RequestOptions>) => {
  const apiBaseUrl = Cypress.env('apiBaseUrl') || Cypress.config('baseUrl')
  const requestOptions: Cypress.RequestOptions = {
    ...options,
    url: `${apiBaseUrl}${options.url}`,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    failOnStatusCode: false,
  }

  return cy.request(requestOptions)
})

Cypress.Commands.add('createBooking', (payload: BookingPayload) => {
  return cy.apiRequest({
    method: 'POST',
    url: '/booking',
    body: payload,
  })
})

Cypress.Commands.add('getBooking', (bookingId: number) => {
  return cy.apiRequest({
    method: 'GET',
    url: `/booking/${bookingId}`,
  })
})

export {}
