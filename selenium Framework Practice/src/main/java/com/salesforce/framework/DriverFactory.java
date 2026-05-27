package com.salesforce.framework;

import io.github.bonigarcia.wdm.WebDriverManager;
import java.time.Duration;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

public class DriverFactory {
  private static final ThreadLocal<WebDriver> DRIVER = new ThreadLocal<>();

  public static WebDriver createDriver() {
    ChromeOptions options = new ChromeOptions();
    options.addArguments("--window-size=1920,1080");
    if (Boolean.parseBoolean(ConfigReader.getProperty("headless"))) {
      options.addArguments("--headless=new");
      options.addArguments("--disable-gpu");
    }
    WebDriverManager.chromedriver().setup();
    WebDriver driver = new ChromeDriver(options);
    driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));
    DRIVER.set(driver);
    return driver;
  }

  public static WebDriver getDriver() {
    return DRIVER.get();
  }

  public static void quitDriver() {
    WebDriver driver = DRIVER.get();
    if (driver != null) {
      driver.quit();
      DRIVER.remove();
    }
  }
}
