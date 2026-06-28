# API Contract Validator — AI-Powered Enterprise API Testing

> Built with Langflow + Groq + Python | Part of AI Tester Blueprint 3X

Paste raw cURL commands → AI parses them → Python executes them → JSON Schema validates contracts → LLM explains failures → Reports generated.

---

## Version History

| Version | Status | Feature |
|---------|--------|---------|
| **v1.0** | ✅ Done | cURL Parser + API Executor |
| **v1.1** | 🔄 Next | Authentication + Variable Resolution (`{{token}}`) |
| **v1.2** | 🔜 | JSON Schema Validation + Assertion Engine |
| **v1.3** | 🔜 | HTML / JSON / Markdown Reports + LLM Explainer |
| **v2.0** | 🔜 | OpenAPI / Swagger + Postman Collection Import |
| **v2.1** | 🔜 | Performance Metrics + Retry Logic |
| **v2.2** | 🔜 | Environment Profiles (DEV/QA/PROD) + Parallel Execution |
| **v3.0** | 🔜 | CI/CD Integration + Historical Dashboard |
| **v3.1** | 🔜 | AI Root Cause Analysis + Fix Suggestions |

---

## Folder Structure

```
API Contract Validator/
├── v1/
│   ├── v1.0_cURL_Parser/
│   ├── v1.1_Auth_Variables/
│   ├── v1.2_Contract_Validation/
│   └── v1.3_Reports/
├── v2/
│   ├── v2.0_OpenAPI_Postman/
│   ├── v2.1_Performance_Retry/
│   └── v2.2_Environments_Parallel/
├── v3/
│   ├── v3.0_CI_CD_Dashboard/
│   └── v3.1_AI_Root_Cause/
├── schemas/          ← shared JSON schemas
├── examples/         ← shared cURL examples
└── README.md
```

---

## Architecture (Final — v3.1)

```
User
 │
 ▼
Paste cURLs / OpenAPI / Postman Collection
 │
 ▼
Groq LLM Parser
 │
 ▼
Variable Resolver  ──► {{token}}, {{bookingid}}
 │
 ▼
API Executor  ──► requests.Session + retry + cookies
 │
 ▼
Contract Validator  ──► JSON Schema + Assertions
 │
 ▼
Report Generator  ──► HTML · JSON · Markdown
 │
 ▼
LLM Root Cause Analyzer
 │
 ▼
Human-Friendly Summary + Fix Suggestions
```

---

## Quick Start (v1.0)

```bash
# Start Langflow
cd Langflow_AI_Tool
source venv/bin/activate
LANGFLOW_AUTO_LOGIN=true langflow run --port 7860

# Open browser
http://localhost:7860

# Import flow
v1/v1.0_cURL_Parser/flow/v1.0.langflow.json

# Paste cURLs from
v1/v1.0_cURL_Parser/examples/restful_booker.txt
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Orchestration | Langflow 1.10 |
| LLM | Groq (llama-3.3-70b-versatile) |
| HTTP | Python requests.Session |
| Schema Validation | jsonschema |
| Reports | HTML + Jinja2 |
| Storage | SQLite (v3.0+) |
