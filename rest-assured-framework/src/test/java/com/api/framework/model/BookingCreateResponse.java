package com.api.framework.model;

public class BookingCreateResponse {
	private int bookingid;
	private BookingPayload booking;

	public BookingCreateResponse() {}

	public int getBookingid() {
		return bookingid;
	}

	public void setBookingid(int bookingid) {
		this.bookingid = bookingid;
	}

	public BookingPayload getBooking() {
		return booking;
	}

	public void setBooking(BookingPayload booking) {
		this.booking = booking;
	}
}
