# v3.0 — CI/CD Integration + Historical Dashboard

## What This Version Adds
- Historical Dashboard: stores every test run in SQLite, tracks trends over time
- Flaky endpoint detection: spots endpoints that pass sometimes and fail others
- Historical HTML dashboard with pass rate trends and response time charts
- Standalone `run_tests.py` script for CI/CD pipelines (no Langflow needed)
- GitHub Actions workflow: auto-runs tests on every push/PR

## Flow
```
Chat Input → API Test Suite v2.2 → Historical Dashboard v3.0 → Prompt Template → Groq → Chat Output
```

## New Node: Historical Dashboard v3.0
| Input | Default | Description |
|-------|---------|-------------|
| Report Summary | wired | From API Test Suite v2.2 |
| Database Path | reports/history.db | SQLite file for storing runs |
| History Limit | 20 | Number of past runs to show |
| Output Directory | reports | Where to save dashboard.html |

## CI/CD Usage
```bash
# Run tests standalone (no Langflow needed)
python ci/run_tests.py \
  --spec examples/restful_booker_openapi.json \
  --env QA \
  --qa-url https://restful-booker.herokuapp.com \
  --db reports/history.db

# Exit code 0 = all passed, 1 = failures found
```

## GitHub Actions
Push to main → GitHub Actions runs `run_tests.py` → fails PR if tests fail.

## Dashboard Features
- Pass rate trend over last N runs
- Response time per endpoint over time
- Flaky endpoint detection
- Environment breakdown (DEV/QA/PROD)
