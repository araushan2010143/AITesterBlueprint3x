package com.api.framework.tests;

import com.api.framework.base.BaseApiTest;
import com.api.framework.builder.BookingPayloadBuilder;
import com.api.framework.model.BookingCreateResponse;
import com.api.framework.model.BookingPayload;
import io.restassured.response.Response;
import org.testng.Assert;
import org.testng.annotations.Test;

public class BookingCrudTests extends BaseApiTest {
	@Test(priority = 1)
	public void testCreateBooking() {
		BookingPayload payload = BookingPayloadBuilder.sampleBooking();
		BookingCreateResponse createResponse = bookingClient.createBooking(payload);
		Assert.assertNotNull(createResponse);
		Assert.assertTrue(createResponse.getBookingid() > 0);
		Assert.assertEquals(createResponse.getBooking().getFirstname(), payload.getFirstname());
	}

	@Test(priority = 2)
	public void testUpdateBooking() {
		BookingPayload payload = BookingPayloadBuilder.sampleBooking();
		BookingCreateResponse createResponse = bookingClient.createBooking(payload);
		Assert.assertTrue(createResponse.getBookingid() > 0);

		BookingPayload updatedPayload = BookingPayloadBuilder.updatedBooking();
		Response updateResponse = bookingClient.updateBooking(createResponse.getBookingid(), updatedPayload, authToken);
		Assert.assertEquals(updateResponse.getStatusCode(), 200);

		BookingPayload updatedBooking = bookingClient.getBookingById(createResponse.getBookingid());
		Assert.assertEquals(updatedBooking.getFirstname(), updatedPayload.getFirstname());
		Assert.assertEquals(updatedBooking.getTotalprice(), updatedPayload.getTotalprice());
	}

	@Test(priority = 3)
	public void testDeleteBooking() {
		BookingPayload payload = BookingPayloadBuilder.sampleBooking();
		BookingCreateResponse createResponse = bookingClient.createBooking(payload);
		Assert.assertTrue(createResponse.getBookingid() > 0);

		Response deleteResponse = bookingClient.deleteBooking(createResponse.getBookingid(), authToken);
		Assert.assertEquals(deleteResponse.getStatusCode(), 201);
	}
}
