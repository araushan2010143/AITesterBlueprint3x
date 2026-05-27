package com.salesforce.framework;

import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterTest;
import org.testng.annotations.BeforeTest;

public class BaseTest {
  protected WebDriver driver;
  protected com.salesforce.pages.LoginPage loginPage;

  @BeforeTest
  public void setUp() {
    driver = DriverFactory.createDriver();
    driver.get(ConfigReader.getProperty("base.url"));
    loginPage = new com.salesforce.pages.LoginPage(driver);
  }

  @AfterTest
  public void tearDown() {
    DriverFactory.quitDriver();
  }
}
