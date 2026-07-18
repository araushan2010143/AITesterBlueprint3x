# QA Glossary — VWO.com Engineering

## Testing Types

**Smoke Testing** — A shallow test suite run after every build to verify the most critical paths work. Fails fast before deeper regression runs.

**Sanity Testing** — A narrow regression run to confirm a specific bug fix or new feature works without checking the full suite.

**Regression Testing** — Full re-execution of the test suite to confirm that new code changes have not broken existing functionality.

**Exploratory Testing** — Simultaneous learning, test design, and execution without predefined scripts. Used to find edge cases and unexpected behaviors.

**End-to-End Testing (E2E)** — Tests that validate complete user flows from the UI through the backend and database, simulating real user behavior.

**Integration Testing** — Tests that verify two or more components work correctly together, e.g. the login API + session cookie + redirect.

**Unit Testing** — Tests of individual functions or classes in isolation, typically written by developers.

**Performance Testing** — Tests that measure system responsiveness, throughput, and stability under load (load testing, stress testing, soak testing).

**A/B Testing** — Controlled experiment where two variants (A and B) are shown to different user segments to measure conversion impact. Core to VWO's product.

---

## VWO-Specific Terms

**VWO (Visual Website Optimizer)** — A/B testing and conversion rate optimization (CRO) platform. Primary product under test.

**Campaign** — An A/B test or multivariate experiment configured in VWO. Has goals, variations, traffic split, and a winner declaration.

**Variation** — One of the versions shown to visitors in a VWO campaign (e.g. Control vs Variation-1).

**Goal** — A conversion metric tracked in a VWO campaign (e.g. button click, form submit, revenue).

**Heatmap** — Visual representation of where users click, move, and scroll on a page. VWO Insights feature.

**Session Recording** — A replay of a visitor's browser session captured by VWO Insights.

**Funnel** — A sequence of pages or events a visitor passes through. VWO tracks funnel drop-off.

**Segment** — A subset of visitors filtered by device, location, behavior, or custom data.

---

## Automation Terms

**Flaky Test** — A test that produces inconsistent results (pass/fail) without code changes. Common causes: timing issues, shared state, network dependency.

**Test Quarantine** — Isolating a flaky test from the main CI pipeline while it is investigated and fixed.

**Page Object Model (POM)** — Design pattern where each web page is represented as a class with locators and actions. Used in Selenium and Playwright frameworks.

**Locator** — A selector used to identify a web element. Types: CSS selector, XPath, ID, data-testid, text.

**Data-testid** — A custom HTML attribute (`data-testid="submit-btn"`) added specifically for test automation. Most stable locator type.

**Soft Assertion** — An assertion that logs a failure but continues test execution (vs hard assertion which stops the test immediately).

**Test Fixture** — Preconditions and teardown setup for a test. In Playwright, fixtures are defined with `test.extend()`.

**Retry Logic** — Automatic re-run of a failed test step or full test to handle transient failures. Playwright has built-in retry via `retries` config.

**Headless Mode** — Running a browser without a visible UI. Faster and suitable for CI pipelines.

**Visual Regression Testing** — Comparing screenshots pixel-by-pixel to detect unintended UI changes.

---

## CI/CD Terms

**Jenkins Pipeline** — An automated CI/CD workflow defined in a Jenkinsfile. Stages typically: checkout → build → test → deploy.

**Build** — A numbered Jenkins execution of a pipeline (e.g. Build #4521). Contains console output, test results, and artifacts.

**Artifact** — Output of a build job (e.g. compiled jar, test report, screenshot). Stored and accessible after the build.

**Green Build** — A CI build where all tests pass. Required before merging to main.

**Test Report** — Output file (JUnit XML, Allure, HTML) generated after a test run. Jenkins parses JUnit XML for pass/fail stats.

**Code Coverage** — Percentage of application code exercised by tests. Measured by tools like JaCoCo (Java) or Istanbul (JS).

---

## Defect Lifecycle

**Bug / Defect** — A deviation between actual and expected behavior found during testing.

**Severity** — Impact of a bug on the system: Blocker > Critical > Major > Minor > Trivial.

**Priority** — Urgency of fixing a bug: P1 (immediate) > P2 (current sprint) > P3 (next sprint) > P4 (backlog).

**Root Cause Analysis (RCA)** — Investigation to identify the fundamental reason a defect occurred, not just the symptom.

**Regression Bug** — A defect in functionality that previously worked, introduced by a code change.

**JIRA Workflow** — Open → In Progress → In Review → Done (with optional Reopened, Blocked states).

---

## Test Management Terms

**Test Case** — A documented set of steps, preconditions, and expected results for verifying a specific requirement.

**Test Suite** — A collection of related test cases grouped by module, feature, or regression scope.

**RTM (Requirements Traceability Matrix)** — A table mapping requirements to test cases, ensuring full coverage.

**Test Plan** — A document describing the scope, approach, resources, and schedule of testing activities.

**Test Coverage** — The extent to which requirements are covered by test cases. Measured as covered/total requirements.

**Sprint Testing** — Testing activities scoped to one Agile sprint (typically 2 weeks). Includes smoke, feature, and regression tests for that sprint's stories.

**UAT (User Acceptance Testing)** — Testing performed by end users or stakeholders to confirm the system meets business requirements before release.

---

## Frameworks Used at VWO

**Selenium WebDriver** — Browser automation library. Tests written in Java using TestNG/JUnit.

**Playwright** — Microsoft's browser automation framework. Supports Chromium, Firefox, WebKit. Tests written in TypeScript.

**TestNG** — Java test framework used with Selenium. Supports parallel execution, data providers, and grouping.

**Allure Report** — Test reporting framework that generates interactive HTML reports from JUnit/TestNG results.

**Maven** — Java build tool used to run Selenium tests (`mvn test`).

**npm / npx** — Node package manager used to run Playwright tests (`npx playwright test`).
