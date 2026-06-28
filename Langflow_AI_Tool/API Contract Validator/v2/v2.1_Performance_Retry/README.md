# v2.1 — Performance Metrics + Retry Logic

## What This Version Adds
- Auto-retry on network errors, timeouts, and 5xx responses
- Exponential backoff: 500ms → 1000ms → 2000ms between retries
- SLA threshold checks per endpoint (e.g. must respond within 2000ms)
- Performance summary: avg / min / max response time across all endpoints
- Retry count reported per endpoint in output

## Flow
```
Chat Input → OpenAPI/Postman Parser → Chained API Executor v2.1 → Validator+Reporter v2.1 → Prompt → Groq → Chat Output
```

## New Inputs: Chained API Executor v2.1
| Input | Default | Description |
|-------|---------|-------------|
| Max Retries | 2 | Number of retry attempts on failure |
| Retry on Status Codes | 500,502,503,504 | HTTP codes that trigger retry |
| Initial Backoff (ms) | 500 | Wait before first retry, doubles each attempt |

## New Input: Validator + Reporter v2.1
| Input | Example | Description |
|-------|---------|-------------|
| SLA Thresholds (JSON) | `{"POST.*auth$": 3000}` | Max allowed response time per endpoint |

## SLA Example
```json
{
  "POST.*auth$":       3000,
  "POST.*booking$":    2000,
  "GET.*booking/\\d+": 2000
}
```

## Performance Output Example
```
PERFORMANCE SUMMARY:
  avg: 712ms | min: 249ms | max: 1468ms

✅ POST /auth — 200 (1468ms) [SLA: 3000ms ✅]
✅ POST /booking — 200 (406ms) [SLA: 2000ms ✅]
✅ GET /booking/1078 — 200 (249ms) [SLA: 2000ms ✅]
```
