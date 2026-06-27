---
title: Universal Bug Triage AI Agent
emoji: 🐛
colorFrom: red
colorTo: orange
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Universal Bug Triage AI Agent

AI-powered bug triage for any issue tracker — Jira, GitHub Issues, Azure DevOps, GitLab, Linear, YouTrack.

## What it does

Paste a raw bug JSON from any supported tracker → get back a structured triage decision with:
- Severity & Priority (P1–P4)
- Root cause category + hypothesis
- Regression detection
- Duplicate detection (TF-IDF similarity against historical bugs)
- Recommended owner, labels, and action
- Confidence score → auto-action (≥0.80) or human review queue

## How to use

1. Wait for the Space to boot (~2 min first launch)
2. Open the **Universal Bug Triage AI Agent** flow
3. Set your **Groq API key** in the Groq LLM node (`https://api.groq.com/openai/v1`)
4. Paste a bug JSON into the **Raw Bug Input** node
5. Paste `knowledge_base/historical_bugs.json` content into the **Knowledge Base Input** node
6. Click **Run** → review the final routing decision

## Sample bugs to try

Sample bug JSONs for all trackers are in the GitHub repo under `sample_bugs/`.

## Architecture

```
Raw Bug JSON → BugConnectorNormalizer → RiskScoringEngine ──┐
                                      → DuplicateDetector ──┤
                                                             ↓
                                               LLM Prompt Builder
                                                             ↓
                                              Groq LLM (llama-3.3-70b)
                                                             ↓
                                              ConfidenceRouter
                                                             ↓
                                          AUTO_ACTION or HUMAN_REVIEW
```
