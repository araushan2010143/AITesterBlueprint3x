package com.api.framework.tests;

import com.api.framework.ApiClient;
import com.api.framework.Endpoints;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.util.Map;

public class UserApiTests {
  private ApiClient apiClient;

  @BeforeClass
  public void setUp() {
    apiClient = new ApiClient();
  }

  @Test(description = "Verify that the users endpoint returns page one with at least one user")
  public void verifyGetUsersReturnsPageOne() {
    Response response = apiClient.get(Endpoints.USERS + "?page=1");
    Assert.assertEquals(response.getStatusCode(), 200, "Expected HTTP 200 for users list");
    JsonPath json = response.jsonPath();
    Assert.assertTrue(json.getInt("page") == 1, "Expected page 1 in response");
    Assert.assertTrue(json.getList("data").size() > 0, "Expected at least one user record");
  }

  @Test(description = "Verify a single user can be fetched by ID", dependsOnMethods = "verifyGetUsersReturnsPageOne")
  public void verifyGetSingleUserById() {
    Response listResponse = apiClient.get(Endpoints.USERS + "?page=1");
    JsonPath listJson = listResponse.jsonPath();
    Map<String, Object> firstUser = listJson.getMap("data[0]");
    int userId = (Integer) firstUser.get("id");

    Response response = apiClient.get(Endpoints.SINGLE_USER, Map.of("id", userId));
    Assert.assertEquals(response.getStatusCode(), 200, "Expected HTTP 200 for single user retrieval");
    JsonPath json = response.jsonPath();
    Assert.assertEquals(json.getInt("data.id"), userId, "Expected returned user id to match requested id");
  }

  @Test(description = "Verify 404 is returned for a user that does not exist")
  public void verifyGetUserNotFound() {
    Response response = apiClient.get(Endpoints.SINGLE_USER, Map.of("id", 9999));
    Assert.assertEquals(response.getStatusCode(), 404, "Expected HTTP 404 for nonexistent user");
  }

  @Test(description = "Verify user creation succeeds with valid payload")
  public void verifyCreateUser() {
    Map<String, Object> payload = Map.of(
      "name", "api-test-user",
      "job", "api engineer"
    );

    Response response = apiClient.post(Endpoints.USERS, payload);
    Assert.assertEquals(response.getStatusCode(), 201, "Expected HTTP 201 for user creation");
    JsonPath json = response.jsonPath();
    Assert.assertEquals(json.getString("name"), "api-test-user", "Expected returned name to match request");
    Assert.assertNotNull(json.getString("id"), "Expected created user id in response");
  }
}
