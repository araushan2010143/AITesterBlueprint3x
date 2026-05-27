package com.api.framework.tests;

import com.api.framework.base.BaseApiTest;
import io.restassured.response.Response;
import org.testng.Assert;
import org.testng.annotations.Test;

public class AuthApiTests extends BaseApiTest {
	@Test(priority = 1)
	public void testCreateAuthToken() {
		String token = authClient.getAuthToken();
		Assert.assertNotNull(token, "Token should not be null");
		Assert.assertFalse(token.isBlank(), "Token should not be blank");
	}

	@Test(priority = 2)
	public void testInvalidAuthReturnsBadCredentials() {
		Response response = authClient.authenticateWithInvalidCredentials();
		Assert.assertEquals(response.getStatusCode(), 200);
		Assert.assertTrue(response.asString().contains("Bad credentials"));
	}
}
