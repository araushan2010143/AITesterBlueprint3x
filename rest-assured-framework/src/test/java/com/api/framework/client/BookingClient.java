package com.api.framework.client;

import com.api.framework.ApiClient;
import com.api.framework.Endpoints;
import com.api.framework.model.BookingCreateResponse;
import com.api.framework.model.BookingPayload;
import io.restassured.response.Response;

import java.util.Map;

public class BookingClient {
	private final ApiClient apiClient = new ApiClient();

	public BookingCreateResponse createBooking(BookingPayload payload) {
		Response response = apiClient.post(Endpoints.BOOKING, payload);
		response.then().statusCode(200);
		return response.as(BookingCreateResponse.class);
	}

	public Response getBookingIds() {
		return apiClient.get(Endpoints.BOOKING);
	}

	public BookingPayload getBookingById(int id) {
		Response response = apiClient.get(Endpoints.BOOKING_BY_ID, Map.of("id", id));
		response.then().statusCode(200);
		return response.as(BookingPayload.class);
	}

	public Response updateBooking(int id, BookingPayload payload, String token) {
		return apiClient.put(Endpoints.BOOKING_BY_ID.replace("{id}", String.valueOf(id)), payload, buildAuthHeaders(token));
	}

	public Response deleteBooking(int id, String token) {
		return apiClient.delete(Endpoints.BOOKING_BY_ID.replace("{id}", String.valueOf(id)), buildAuthHeaders(token));
	}

	private Map<String, String> buildAuthHeaders(String token) {
		return Map.of("Cookie", "token=" + token);
	}
}
