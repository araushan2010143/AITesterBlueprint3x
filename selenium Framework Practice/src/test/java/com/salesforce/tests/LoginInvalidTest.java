package com.salesforce.tests;

import com.salesforce.framework.BaseTest;
import com.salesforce.framework.ConfigReader;
import org.testng.Assert;
import org.testng.annotations.Test;

public class LoginInvalidTest extends BaseTest {

  @Test
  public void invalidLoginTest() {
    loginPage.login(ConfigReader.getProperty("invalid.username"), ConfigReader.getProperty("invalid.password"));
    String actualError = loginPage.getErrorMessageText();
    Assert.assertTrue(actualError.length() > 0, "Expected an error message when login fails with invalid credentials.");
  }
}
