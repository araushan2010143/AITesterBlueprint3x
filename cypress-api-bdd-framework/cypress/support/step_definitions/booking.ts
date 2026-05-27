import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor'
import { BookingPayload, BookingCreateResponse } from '../../../src/models/bookingPayload'
import { BookingApi } from '../../../src/api/bookingApi'
import { PayloadFactory } from '../../../src/utils/payloadFactory'

let bookingPayload: BookingPayload
let bookingResponse: BookingCreateResponse

const bookingApi = new BookingApi()

Given('I prepare a valid booking payload', () => {
  bookingPayload = PayloadFactory.createBookingPayload()
})

When('I send the booking create request', () => {
  bookingApi.createBooking(bookingPayload).then((response) => {
    expect(response.status).to.equal(200)
    bookingResponse = response.body as BookingCreateResponse
  })
})

Then('the created booking response should contain the payload values', () => {
  expect(bookingResponse).to.have.property('booking')
  expect(bookingResponse.booking.firstname).to.equal(bookingPayload.firstname)
  expect(bookingResponse.booking.lastname).to.equal(bookingPayload.lastname)
  expect(bookingResponse.booking.totalprice).to.equal(bookingPayload.totalprice)
  expect(bookingResponse.booking.bookingdates.checkin).to.equal(bookingPayload.bookingdates.checkin)
})
