import { BookingPayload } from '../models/bookingPayload'

export class PayloadFactory {
  static createBookingPayload(): BookingPayload {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    return {
      firstname: 'John',
      lastname: 'Doe',
      totalprice: 150,
      depositpaid: true,
      bookingdates: {
        checkin: today.toISOString().split('T')[0],
        checkout: tomorrow.toISOString().split('T')[0],
      },
      additionalneeds: 'Breakfast',
    }
  }
}
