import { After, Before, Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { BaseApiTest } from '../../src/core/baseTest';
import { PageManager } from '../../src/pages/pageManager';
import { BookingPayload } from '../../src/models/bookingPayload';
import { PayloadFactory } from '../../src/utils/payloadFactory';
import { ResponseHelper } from '../../src/utils/responseHelper';
import { JsonPathMap } from '../../src/utils/jsonPath';

let baseApiTest: BaseApiTest;
let pageManager: PageManager;
let createdBookingResponse: Record<string, any>;
let bookingPayload: BookingPayload;
let bookingId: number;
let retrievedBooking: Record<string, any>;

Before(async function () {
  baseApiTest = new BaseApiTest();
  await baseApiTest.init();
  pageManager = new PageManager(baseApiTest.requestContext);
});

After(async function () {
  await baseApiTest.cleanup();
});

Given('the API framework is configured for the current environment', async function () {
  expect(baseApiTest.environment.name).to.be.oneOf(['qa', 'dev', 'prod']);
});

When('I generate a booking payload for the booking API', function () {
  bookingPayload = PayloadFactory.createBookingPayload();
  expect(bookingPayload).to.have.property('firstname');
});

When('I create the booking using the API context', async function () {
  const response = await pageManager.bookingPage.createBooking(bookingPayload);
  expect(response.ok()).to.be.true;
  createdBookingResponse = await response.json();
  bookingId = createdBookingResponse.bookingid;
  expect(bookingId).to.be.a('number');
});

Then('the response should contain the booking data for firstname and lastname', function () {
  const firstname = ResponseHelper.getValueByPath<string>(createdBookingResponse.booking, JsonPathMap.booking.firstname);
  const lastname = ResponseHelper.getValueByPath<string>(createdBookingResponse.booking, JsonPathMap.booking.lastname);
  expect(firstname).to.equal(bookingPayload.firstname);
  expect(lastname).to.equal(bookingPayload.lastname);
});

When('I retrieve the booking by id', async function () {
  const response = await pageManager.bookingPage.getBooking(bookingId);
  expect(response.ok()).to.be.true;
  retrievedBooking = await response.json();
});

Then('the retrieved booking should match the original booking payload', function () {
  const firstname = ResponseHelper.getValueByPath<string>(retrievedBooking, JsonPathMap.booking.firstname);
  const lastname = ResponseHelper.getValueByPath<string>(retrievedBooking, JsonPathMap.booking.lastname);
  expect(firstname).to.equal(bookingPayload.firstname);
  expect(lastname).to.equal(bookingPayload.lastname);
});
