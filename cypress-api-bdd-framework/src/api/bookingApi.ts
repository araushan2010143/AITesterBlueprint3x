import { BookingPayload, BookingCreateResponse } from '../models/bookingPayload'

export class BookingApi {
  createBooking(payload: BookingPayload) {
    return cy.createBooking(payload)
  }

  getBooking(bookingId: number) {
    return cy.getBooking(bookingId)
  }
}
