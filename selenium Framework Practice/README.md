# Selenium Framework Practice

This folder contains a Maven + TestNG Selenium framework (Page Object Model) for the Salesforce login page.

## Purpose
- Minimal enterprise-style framework with PageFactory-based `LoginPage` and two TestNG tests: valid and invalid login.

## Prerequisites
- Java 17+ must be installed and available on `PATH` or via `JAVA_HOME`.
- The project includes the Maven Wrapper so you do not need a system `mvn` installation.

## macOS (recommended) quick Java install
```bash
# Install OpenJDK 17 via Homebrew
brew install openjdk@17
# Register installed JDK (macOS Apple Silicon example)
sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
# Add to shell (zsh)
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
echo 'export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"' >> ~/.zshrc
source ~/.zshrc
```

Verify Java and the Maven wrapper:
```bash
java -version
# from project folder
auto cd "selenium Framework Practice" && ./mvnw -v
```

## Run tests
From the project folder:
```bash
cd "selenium Framework Practice"
# Run all tests
./mvnw test
# Run a single TestNG class (example)
./mvnw -Dtest=com.salesforce.tests.LoginValidTest test
```

## Configure credentials and options
Edit `src/test/resources/config.properties` and set `valid.username` / `valid.password`. Do NOT commit real credentials. To run tests in headless mode set `headless=true` in the same file.

## Notes & Troubleshooting
- If `./mvnw` fails with "Unable to locate a Java Runtime", install a JDK as shown above.
- The framework uses XPath only (per requirement) and WebDriverManager to manage ChromeDriver.
- If you want me to attempt installing a JDK in this environment and run the tests end-to-end, confirm and I will proceed (this requires network access and may modify the system environment).

## Files of interest
- `pom.xml` — Maven project file
- `testng.xml` — TestNG suite
- `src/main/java/com/salesforce/pages/LoginPage.java` — Page Object
- `src/main/java/com/salesforce/framework/DriverFactory.java` — WebDriver setup
- `src/test/java/com/salesforce/tests/` — TestNG test classes
- `src/test/resources/config.properties` — Test configuration (URL, credentials, headless)
