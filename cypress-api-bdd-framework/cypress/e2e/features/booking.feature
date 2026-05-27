Feature: Booking API automation

  Scenario: Create a booking and validate the response payload
    Given I prepare a valid booking payload
    When I send the booking create request
    Then the created booking response should contain the payload values

  Scenario: Get booking by id and verify stored values
    Given I prepare a valid booking payload
    When I send the booking create request
    And I fetch the created booking by id
    Then the retrieved booking should match the original payload

  Scenario: Get non-existing booking returns 404
    When I request booking with id 99999999
    Then the response status should be 404
