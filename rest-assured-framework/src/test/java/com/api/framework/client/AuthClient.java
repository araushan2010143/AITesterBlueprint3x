package com.api.framework.client;

import com.api.framework.ApiClient;
import com.api.framework.ConfigReader;
import com.api.framework.Endpoints;
import com.api.framework.model.AuthResponse;
import io.restassured.response.Response;

import java.util.Map;

public class AuthClient {
	private final ApiClient apiClient = new ApiClient();

	public AuthResponse authenticate() {
		Map<String, String> authPayload = Map.of(
			"username", ConfigReader.get("auth.username"),
			"password", ConfigReader.get("auth.password")
		);

		Response response = apiClient.post(Endpoints.AUTH, authPayload);
		response.then().statusCode(200);
		return response.as(AuthResponse.class);
	}

	public Response authenticateWithInvalidCredentials() {
		Map<String, String> authPayload = Map.of(
			"username", "invalid-user",
			"password", "invalid-password"
		);
		return apiClient.post(Endpoints.AUTH, authPayload);
	}

	public String getAuthToken() {
		return authenticate().getToken();
	}
}
