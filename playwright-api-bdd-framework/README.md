# Playwright API BDD Framework

This framework is a scalable Playwright API automation solution built in TypeScript using a BDD-style structure with Cucumber.

## Key Features
- Playwright API context for HTTP automation
- BDD feature file and step definitions
- Page manager with API page object pattern
- Environment configuration for `qa`, `dev`, and `prod`
- Centralized global config for base URL, timeout, and logging
- User credentials defined per environment
- JSON path mapping for booking and auth response fields
- Reusable utilities for payload generation and response extraction

## Folder structure
- `tests/features` - Cucumber feature files
- `tests/steps` - Step definitions
- `src/core` - Base test classes, global config, endpoints
- `src/pages/api` - API page objects
- `src/pages/pageManager.ts` - Central page manager
- `src/utils` - JSON path mapping, payload factories, response helper
- `src/data/environments` - Environment-specific configuration
- `src/data/users` - Environment-specific user credentials

## Setup
1. Install dependencies:
```bash
cd playwright-api-bdd-framework
npm install
```
2. Execute tests for a specific environment:
```bash
npm run test:qa
npm run test:dev
npm run test:prod
```

## Environment handling
- `NODE_ENV=qa` loads `src/data/environments/qa.json`
- `NODE_ENV=dev` loads `src/data/environments/dev.json`
- `NODE_ENV=prod` loads `src/data/environments/prod.json`

## Add new API pages
1. Create a new API page object under `src/pages/api`
2. Add it to `src/pages/pageManager.ts`
3. Call the page methods from step definitions

## Notes
- The BDD feature file uses environment configuration from the current `NODE_ENV`
- `ResponseHelper` uses JSON path mapping from `src/utils/jsonPath.ts`
- This framework is intentionally structured for extension with additional API endpoints, custom reporting, and CI/CD integration
