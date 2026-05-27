package com.api.framework.base;

import com.api.framework.client.AuthClient;
import com.api.framework.client.BookingClient;
import org.testng.annotations.BeforeClass;

public abstract class BaseApiTest {
	protected AuthClient authClient;
	protected BookingClient bookingClient;
	protected String authToken;

	@BeforeClass
	public void setup() {
		authClient = new AuthClient();
		bookingClient = new BookingClient();
		authToken = authClient.getAuthToken();
	}
}
