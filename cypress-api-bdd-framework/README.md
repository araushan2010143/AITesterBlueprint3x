# Cypress API BDD Framework

A Cypress API automation framework scaffold built for BDD and Allure reporting.

## Folder Structure

- `cypress/`
  - `e2e/features/` - `.feature` files for BDD scenarios
  - `e2e/step_definitions/` - step definitions for Cucumber
  - `support/` - Cypress support file and custom commands
- `src/`
  - `api/` - reusable API client wrappers
  - `models/` - request/response data models
  - `utils/` - helpers, payload builders, logging utilities
- `reports/` - generated report artifacts
- `cypress.config.ts` - Cypress configuration
- `tsconfig.json` - TypeScript config
- `package.json` - dependencies and scripts

## Installation

```bash
cd cypress-api-bdd-framework
npm install
```

## Run Tests

```bash
npm run test:qa
```

## Open Cypress

```bash
npm run open
```

## Allure Reporting

Generate the HTML report after test execution:

```bash
npm run allure:generate
```

Open the generated report:

```bash
npm run allure:open
```

## Environment Profiles

The framework supports `qa`, `dev`, and `prod` profiles via `CYPRESS_ENV`:

```bash
CYPRESS_ENV=qa npm run test:qa
```

## Notes

- The default API endpoint is configured in `cypress.env.qa.json`.
- Custom commands are available in `cypress/support/commands.ts`.
- BDD scenario definitions live in `cypress/e2e/features` and `cypress/e2e/step_definitions`.
