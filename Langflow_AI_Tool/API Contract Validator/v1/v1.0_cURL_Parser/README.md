# v1.0 — cURL Parser + API Executor

## What This Version Does
- User pastes one or more raw cURL commands
- Groq LLM parses them into structured JSON
- API Executor calls each API using `requests.Session`
- Raw responses shown in Chat Output

## Flow
```
Chat Input → Prompt Template → Groq LLM → API Executor → Chat Output
```

## Nodes
| Node | Role |
|------|------|
| Chat Input | User pastes cURLs |
| Prompt Template | Instructs LLM to extract method, url, headers, body |
| Groq (llama-3.3-70b) | Parses cURLs → JSON array |
| API Executor (Python) | Calls each API, returns status + response |
| Chat Output | Shows results |

## How to Test
1. Import `flow/v1.0.langflow.json` into Langflow
2. Open Playground
3. Paste cURLs from `examples/restful_booker.txt`
4. Expected: JSON with status_code, response, duration_ms per API

## Demo Output
```json
{
  "results": [
    {
      "method": "POST",
      "url": "https://restful-booker.herokuapp.com/auth",
      "status_code": 200,
      "duration_ms": 312,
      "response": { "token": "abc123xyz" },
      "error": null
    }
  ]
}
```
