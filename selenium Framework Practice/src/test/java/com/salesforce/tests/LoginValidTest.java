package com.salesforce.tests;

import com.salesforce.framework.BaseTest;
import com.salesforce.framework.ConfigReader;
import java.time.Duration;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.Assert;
import org.testng.annotations.Test;

public class LoginValidTest extends BaseTest {

  @Test
  public void validLoginTest() {
    loginPage.login(ConfigReader.getProperty("valid.username"), ConfigReader.getProperty("valid.password"));
    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));
    wait.until(ExpectedConditions.not(ExpectedConditions.titleContains("Login")));
    Assert.assertFalse(driver.getTitle().contains("Login"), "Expected successful login and landing page title after valid credentials.");
  }
}
