#!/bin/bash
# Restful Booker — CI/CD run example (v3.0)
# Runs the full API contract validation without Langflow.
# Exit code 0 = all passed, 1 = failures found.
# Used by GitHub Actions: .github/workflows/api-contract-tests.yml

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
RUNNER="$REPO_ROOT/v3/v3.0_CI_CD_Dashboard/ci/run_tests.py"
SPEC="$REPO_ROOT/v2/v2.0_OpenAPI_Postman/examples/restful_booker_openapi.json"

python3 "$RUNNER" \
  --spec    "$SPEC" \
  --env     QA \
  --qa-url  https://restful-booker.herokuapp.com \
  --schemas '{"POST.*auth$":{"required":["token"],"types":{"token":"str"}},"POST.*booking$":{"required":["bookingid","booking"],"types":{"bookingid":"int"}},"GET.*booking/\\d+":{"required":["firstname","lastname","totalprice","depositpaid","bookingdates"],"types":{"totalprice":"int","depositpaid":"bool"}}}' \
  --assertions '[{"url":"POST.*auth$","field":"token","operator":"!=","value":null,"label":"token not null"},{"url":"POST.*booking$","field":"bookingid","operator":">","value":0,"label":"bookingid > 0"},{"url":"GET.*booking/\\d+","field":"totalprice","operator":">","value":0,"label":"totalprice > 0"}]' \
  --expected '{"POST.*auth$":200,"POST.*booking$":200,"GET.*booking/\\d+":200}' \
  --sla      '{"POST.*auth$":5000,"POST.*booking$":3000,"GET.*booking/\\d+":3000}' \
  --db       reports/history.db \
  --output-dir reports

# Exit code propagates to CI — non-zero fails the pipeline
