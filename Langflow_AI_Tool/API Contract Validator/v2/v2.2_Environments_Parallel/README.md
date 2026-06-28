# v2.2 — Environment Profiles (DEV/QA/PROD) + Parallel Execution

## What This Version Adds
- Environment Config node: define DEV / QA / PROD base URLs and seed variables in one place
- Switch environments by changing one field (Active Environment)
- Parallel execution mode: run independent requests simultaneously using ThreadPoolExecutor
- Sequential mode (default): preserves variable chaining (token → bookingid)
- Base URL auto-substituted across all requests from the active environment profile

## Flow
```
Chat Input → OpenAPI/Postman Parser
                    ↓
         Chained API Executor v2.2 ← Environment Config v2.2
                    ↓
         Validator + Reporter v2.1
                    ↓
         Prompt Template → Groq → Chat Output
```

## New Node: Environment Config v2.2
| Input | Example | Description |
|-------|---------|-------------|
| Environment Profiles (JSON) | see below | Full DEV/QA/PROD config |
| Active Environment | QA | Which env to run against |

## Profiles Example
```json
{
  "DEV":  { "base_url": "https://dev.api.com",  "variables": { "api_key": "dev-key" } },
  "QA":   { "base_url": "https://qa.api.com",   "variables": { "api_key": "qa-key"  } },
  "PROD": { "base_url": "https://api.com",       "variables": {} }
}
```

## New Input: Chained API Executor v2.2
| Input | Default | Description |
|-------|---------|-------------|
| Parallel Workers | 1 | 1=sequential+chaining, >1=parallel (no chaining) |
| Environment Config | {} | Wired from Environment Config node |

## Parallel vs Sequential
| Mode | Workers | Variable Chaining | Best For |
|------|---------|-------------------|----------|
| Sequential | 1 | ✅ Yes | Auth → Create → Get chains |
| Parallel | 3+ | ❌ No | Independent smoke tests |
