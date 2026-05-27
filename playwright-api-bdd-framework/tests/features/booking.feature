Feature: Booking API automation
  As a QA engineer
  I want to exercise the booking API using a scalable Playwright API BDD framework
  So that environment-specific execution and reusable service objects are supported

  Background:
    Given the API framework is configured for the current environment

  Scenario: Create a booking and verify response fields
    When I generate a booking payload for the booking API
    And I create the booking using the API context
    Then the response should contain the booking data for firstname and lastname

  Scenario: Get booking details by booking id
    When I generate a booking payload for the booking API
    And I create the booking using the API context
    And I retrieve the booking by id
    Then the retrieved booking should match the original booking payload
