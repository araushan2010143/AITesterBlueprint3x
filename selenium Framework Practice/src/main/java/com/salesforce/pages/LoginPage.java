package com.salesforce.pages;

import java.time.Duration;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

public class LoginPage {
  private final WebDriver driver;

  @FindBy(xpath = "//input[@id='username']")
  private WebElement username;

  @FindBy(xpath = "//input[@id='password']")
  private WebElement password;

  @FindBy(xpath = "//input[@id='Login']")
  private WebElement loginButton;

  @FindBy(xpath = "//*[@id='error']")
  private WebElement errorMessage;

  public LoginPage(WebDriver driver) {
    this.driver = driver;
    PageFactory.initElements(driver, this);
  }

  public void waitForLoginPage() {
    new WebDriverWait(driver, Duration.ofSeconds(15)).until(ExpectedConditions.visibilityOf(username));
  }

  public void login(String user, String pass) {
    try {
      waitForLoginPage();
      username.clear();
      username.sendKeys(user);
      password.clear();
      password.sendKeys(pass);
      loginButton.click();
    } catch (Exception e) {
      throw new RuntimeException("Login action failed", e);
    }
  }

  public String getErrorMessageText() {
    try {
      return new WebDriverWait(driver, Duration.ofSeconds(15)).until(ExpectedConditions.visibilityOf(errorMessage)).getText();
    } catch (Exception e) {
      return "";
    }
  }

  public boolean isLoginPageDisplayed() {
    try {
      return username.isDisplayed();
    } catch (Exception e) {
      return false;
    }
  }
}
