# v2.0 — OpenAPI / Swagger + Postman Collection Import

## What This Version Adds
- Paste an OpenAPI 3.0 / Swagger 2.0 JSON spec → auto-generates requests
- Paste a Postman Collection v2.1 JSON → auto-generates requests
- Path parameters `{bookingid}` auto-converted to `{{bookingid}}` for variable resolution
- No LLM needed for parsing — pure Python spec parser
- Plugs directly into ChainedAPIExecutor + ValidatorReporter from v1.x

## Flow
```
Chat Input → OpenAPI/Postman Parser → ChainedAPIExecutor → ValidatorReporter → Prompt → Groq → Chat Output
```

## Supported Formats
| Format | Detection |
|--------|-----------|
| OpenAPI 3.0 | `"openapi": "3.x.x"` key present |
| Swagger 2.0 | `"swagger": "2.0"` key present |
| Postman v2.1 | `"item"` key present |

## How to Test
1. Import `flow/v2.0.langflow.json` into Langflow
2. Open Playground
3. Paste contents of `examples/restful_booker_openapi.json`
4. Or paste contents of `examples/restful_booker_postman.json`
5. Expected: same 3-endpoint chain as v1.x, fully validated

## Key Difference from v1.x
| v1.x | v2.0 |
|------|------|
| User pastes raw cURL commands | User pastes OpenAPI/Postman spec |
| Groq LLM parses cURLs | Python parser reads spec directly |
| Manual schema config | Schemas auto-extracted from OpenAPI |
