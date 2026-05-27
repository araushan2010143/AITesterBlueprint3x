/// <reference types="cypress" />

import '../../src/models/bookingPayload'

declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
      apiRequest(options: Partial<RequestOptions>): Chainable<Response<any>>
      createBooking(payload: BookingPayload): Chainable<Response<any>>
      getBooking(bookingId: number): Chainable<Response<any>>
    }
  }
}
