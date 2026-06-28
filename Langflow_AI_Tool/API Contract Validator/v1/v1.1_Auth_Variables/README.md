# v1.1 — Authentication + Variable Resolution

## What This Version Adds
- Automatically extracts `token`, `bookingid`, `userId` from responses
- Replaces `{{token}}`, `{{bookingid}}` in subsequent requests
- Full API chain works end-to-end without manual copy-paste

## Flow
```
Chat Input → Prompt → Groq → API Executor → Variable Resolver → API Executor (chained) → Chat Output
```

## New Node: Variable Resolver
- Reads response from Step 1 (auth)
- Stores `token = "abc123"`
- Injects into next request headers/body automatically

## How to Test
Paste the full Restful Booker chain:
1. POST /auth → extracts token
2. POST /booking → extracts bookingid
3. GET /booking/{{bookingid}} → auto-resolved
4. DELETE /booking/{{bookingid}} with Cookie: token={{token}} → auto-resolved
