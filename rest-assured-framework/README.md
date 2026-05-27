# Rest Assured API Testing Framework

This folder contains a lightweight enterprise-style REST API automation framework using Rest Assured and TestNG.

## Folder Structure

- `pom.xml` — Maven dependencies and build configuration
- `testng.xml` — TestNG suite definition
- `src/test/resources/config.properties` — API environment configuration
- `src/test/java/com/api/framework/` — framework classes and utilities
- `src/test/java/com/api/framework/tests/` — sample API test cases

## How to Run

From the folder:

```bash
cd "/Users/abhishekraushan/Documents/AITESTERBLUEPRINT_3X/rest-assured-framework"
./mvnw test
```

## Configuration

Edit `src/test/resources/config.properties` to change the API base URI.

## Sample Tests

- `UserApiTests` covers:
  - GET users list
  - GET single user by ID
  - GET user not found
  - POST create user

## Notes

- Uses Rest Assured request specifications from `RestAssuredConfig`
- Uses `ConfigReader` to load properties from the classpath
- Sample API endpoints are based on `https://reqres.in/api`
