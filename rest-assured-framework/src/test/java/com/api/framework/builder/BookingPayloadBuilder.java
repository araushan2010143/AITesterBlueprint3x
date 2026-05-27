package com.api.framework.builder;

import com.api.framework.model.BookingDates;
import com.api.framework.model.BookingPayload;

public class BookingPayloadBuilder {
	public static BookingPayload sampleBooking() {
		return new BookingPayload(
			"Abhishek",
			"Raushan",
			265,
			true,
			new BookingDates("2026-06-01", "2026-06-08"),
			"Breakfast"
		);
	}

	public static BookingPayload updatedBooking() {
		return new BookingPayload(
			"Abhishek",
			"Raushan",
			300,
			false,
			new BookingDates("2026-06-05", "2026-06-12"),
			"Late checkout"
		);
	}
}
