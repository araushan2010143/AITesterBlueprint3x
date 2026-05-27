Feature: Booking API automation

  Scenario: Create a booking and validate the response payload
    Given I prepare a valid booking payload
    When I send the booking create request
    Then the created booking response should contain the payload values
