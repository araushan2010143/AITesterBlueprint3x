import { BookingPayload } from './bookingPayload';

export interface BookingCreateResponse {
  bookingid: number;
  booking: BookingPayload;
}
