package com.api.framework;

import io.restassured.RestAssured;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.filter.log.LogDetail;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;

public class RestAssuredConfig {
  private static final RequestSpecification REQUEST_SPEC;

  static {
    RestAssured.baseURI = ConfigReader.get("base.uri");
    REQUEST_SPEC = new RequestSpecBuilder()
      .setContentType(ContentType.JSON)
      .setAccept(ContentType.JSON)
      .log(LogDetail.ALL)
      .build();
  }

  public static RequestSpecification getRequestSpecification() {
    return REQUEST_SPEC;
  }
}
