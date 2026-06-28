# v1.2 — JSON Schema Contract Validation + Assertions

## What This Version Adds
- Validates every API response against a JSON Schema
- Custom assertion engine: `price > 0`, `status == "ACTIVE"`, `token != null`
- Per-endpoint PASS / FAIL result
- Status code validation

## Flow
```
... API Executor → Contract Validator → Chat Output
```

## New Node: Contract Validator
- Loads schema from `schemas/` folder
- Matches URL pattern to schema
- Runs jsonschema.validate()
- Evaluates assertion rules
- Returns structured PASS/FAIL report

## Schema Example
```json
{
  "/auth": {
    "type": "object",
    "required": ["token"],
    "properties": { "token": { "type": "string" } }
  }
}
```

## Assertion Example
```json
[
  { "url": "/booking", "field": "totalprice", "operator": ">", "value": 0 },
  { "url": "/auth",    "field": "token",      "operator": "!=","value": null }
]
```
