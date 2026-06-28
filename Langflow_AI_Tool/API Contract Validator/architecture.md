# API Contract Validator

> Enterprise-grade AI-powered API Contract Testing Platform built with
> **Langflow**, **Python**, **JSON Schema**, and **LLMs**.

---

## Executive Summary

API Contract Validator executes real APIs, validates contracts
deterministically, performs business assertions, measures performance,
and uses AI only for explanation — not execution.

**Core Principle**

- AI → Understands & Explains
- Python → Executes APIs
- JSON Schema → Validates Contracts
- Reports → Evidence

---

## Problem Statement

Modern APIs change frequently. Small contract changes such as:
- Missing fields
- Data type changes
- Status code changes
- Authentication failures

can break downstream consumers.

This project automatically detects those changes before production.

---

## Objectives

- Execute real APIs
- Validate response contracts
- Chain authenticated requests
- Generate HTML/JSON reports
- Explain failures using AI
- Support CI/CD

---

## High Level Architecture

```text
User
 ↓
Paste cURLs / OpenAPI / Postman
 ↓
Langflow
 ↓
LLM Parser
 ↓
Authentication Manager
 ↓
Variable Resolver
 ↓
HTTP Executor
 ↓
Schema Validator
 ↓
Assertion Engine
 ↓
Performance Collector
 ↓
Report Generator
 ↓
AI Root Cause Analysis
```

## Technology Stack

| Layer       | Technology                   |
|-------------|------------------------------|
| Workflow    | Langflow 1.10.0              |
| AI          | Groq (llama-3.3-70b-versatile) |
| Programming | Python 3.11                  |
| HTTP        | requests + Session           |
| Validation  | JSON Schema (custom engine)  |
| Reports     | HTML / JSON / Markdown       |
| Database    | SQLite                       |
| CI/CD       | GitHub Actions               |

## Working Principle

1. User pastes cURLs/OpenAPI/Postman collection.
2. LLM converts them into structured API definitions.
3. Python executes requests using `requests.Session()`.
4. Authentication and variables are propagated automatically.
5. Responses are validated against JSON Schema.
6. Business assertions are executed.
7. Performance metrics are collected.
8. Reports are generated.
9. AI explains failures and recommends fixes.

## Version Roadmap

| Version | Capability                          | Benefit                   |
|---------|-------------------------------------|---------------------------|
| v1.0    | AI cURL Parser + HTTP Executor      | Execute real APIs         |
| v1.1    | Authentication + Variable Resolution | End-to-end API chaining  |
| v1.2    | JSON Schema + Assertions            | Detect breaking changes   |
| v1.3    | Reports + AI Explanation            | Human-readable debugging  |
| v2.0    | OpenAPI & Postman Import            | Automatic onboarding      |
| v2.1    | Performance + Retry                 | Reliable execution        |
| v2.2    | Environment Profiles + Parallel     | Faster regression         |
| v3.0    | CI/CD + Historical Dashboard        | Continuous quality        |
| v3.1    | AI Root Cause Analysis              | Faster issue resolution   |

## Version Details

### v1.0

**Objective:** Parse cURLs and execute APIs.

**Components:** AI Parser, HTTP Executor

**Input:**
```bash
curl -X POST https://api.example.com/auth \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password123"}'
```

**Output:** Parsed request + HTTP response

**Benefits:** Eliminates manual execution, supports multiple APIs

---

### v1.1

**Objective:** Manage authentication and variables.

**Features:** Bearer Token, JWT, Cookies, API Keys, `{{variables}}`

**Benefits:** Automatic request chaining, no manual token updates

---

### v1.2

**Objective:** Validate contracts.

**Checks:** Status code, Required fields, Data types, Arrays, Nested objects, Assertions

**Example:**

Expected: `{"price": 120}` (int)
Received: `{"price": "120"}` (str)
Result: **FAIL** — type mismatch

---

### v1.3

Generate: HTML Report, JSON Report, Markdown Report

AI explains: Root cause, Impact, Suggested fix

---

### v2.0

Import: OpenAPI 3.x, Swagger 2.0, Postman Collections v2.1

---

### v2.1

Collect: Response time, Payload size, Retries, Timeouts

Retry with exponential backoff: 500ms → 1000ms → 2000ms

---

### v2.2

Supports: DEV, QA, UAT, PROD environments

Parallel execution using `ThreadPoolExecutor`

---

### v3.0

Integrates with: GitHub Actions, Jenkins, Azure DevOps

Tracks: Success rate, Failures, Historical trends via SQLite + Chart.js

---

### v3.1

AI analyzes: Contract violations, Severity (CRITICAL/HIGH/MEDIUM/LOW),
Impact, Regression detection, Recommended fixes

---

## Folder Structure

```text
API_Contract_Validator/
├── flow/
├── custom_components/
├── schemas/
├── reports/
├── logs/
├── config/
├── examples/
├── README.md
├── OVERVIEW.html
├── architecture.md
├── v1/
│   ├── v1.0_cURL_Parser/
│   ├── v1.1_Auth_Variables/
│   ├── v1.2_Contract_Validation/
│   └── v1.3_Reports/
├── v2/
│   ├── v2.0_OpenAPI_Postman/
│   ├── v2.1_Performance_Retry/
│   └── v2.2_Environments_Parallel/
└── v3/
    ├── v3.0_CI_CD_Dashboard/
    └── v3.1_AI_Root_Cause/
```

## Enterprise Benefits

- Real API execution (no mocked responses)
- Deterministic contract validation
- Automatic authentication propagation
- Dynamic variable resolution
- JSON Schema validation
- Business assertions engine
- Performance monitoring with SLA checks
- AI-assisted root cause analysis
- HTML/JSON/Markdown reporting
- OpenAPI 3.x / Swagger 2.0 / Postman v2.1 support
- Parallel execution with ThreadPoolExecutor
- CI/CD ready with GitHub Actions
- Historical trend tracking with SQLite

## Future Roadmap

- GraphQL validation
- gRPC support
- AI-generated test cases
- Self-healing contracts
- Multi-agent orchestration
- Distributed execution

## Conclusion

API Contract Validator combines deterministic execution with AI-powered
reasoning to create a production-ready API contract testing platform.
The architecture ensures reliability, scalability, and maintainability
while integrating seamlessly into modern DevOps pipelines.
