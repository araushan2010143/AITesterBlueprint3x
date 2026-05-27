package com.api.framework.tests;

import com.api.framework.base.BaseApiTest;
import io.restassured.response.Response;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

public class BookingIdsTests extends BaseApiTest {
	@Test
	public void testGetBookingIds() {
		Response response = bookingClient.getBookingIds();
		Assert.assertEquals(response.getStatusCode(), 200);

		List<Map<String, Object>> bookingIds = response.jsonPath().getList("", Map.class);
		Assert.assertNotNull(bookingIds);
		Assert.assertFalse(bookingIds.isEmpty(), "Booking id list should not be empty");
	}
}
