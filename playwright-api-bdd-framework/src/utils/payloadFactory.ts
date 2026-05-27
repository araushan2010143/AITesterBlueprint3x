import { BookingPayload } from '../models/bookingPayload';

export const PayloadFactory = {
  createBookingPayload(): BookingPayload {
    return {
      firstname: 'Test',
      lastname: 'User',
      totalprice: 199,
      depositpaid: true,
      bookingdates: {
        checkin: '2026-09-01',
        checkout: '2026-09-10'
      },
      additionalneeds: 'Breakfast'
    };
  }
};
