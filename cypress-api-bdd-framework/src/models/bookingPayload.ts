export interface BookingDates {
  checkin: string
  checkout: string
}

export interface BookingPayload {
  firstname: string
  lastname: string
  totalprice: number
  depositpaid: boolean
  bookingdates: BookingDates
  additionalneeds: string
}

export interface BookingCreateResponse {
  bookingid: number
  booking: BookingPayload
}
