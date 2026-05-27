package com.api.framework;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;

import static io.restassured.RestAssured.given;

public class ApiClient {
  private final RequestSpecification spec;

  public ApiClient() {
    this.spec = RestAssuredConfig.getRequestSpecification();
  }

  public Response get(String endpoint) {
    return given()
      .spec(spec)
      .when()
      .get(endpoint)
      .then()
      .contentType(ContentType.JSON)
      .extract()
      .response();
  }

  public Response get(String endpoint, Object pathParams) {
    return given()
      .spec(spec)
      .pathParams(pathParams)
      .when()
      .get(endpoint)
      .then()
      .contentType(ContentType.JSON)
      .extract()
      .response();
  }

  public Response post(String endpoint, Object body) {
    return given()
      .spec(spec)
      .body(body)
      .when()
      .post(endpoint)
      .then()
      .contentType(ContentType.JSON)
      .extract()
      .response();
  }
}
