"""
FactCheckAgent — verifies factual claims in an AI answer against source chunks.

Input (AgentTask):
  task.query              = the AI-generated answer text to fact-check
  task.extra["citations"] = list of {"excerpt": str, "filename": str} dicts
                            (pass the citations returned by /api/search/ask)
  task.top_k              = additional RAG retrieval top-k for cross-checking

Output dict:
  {
    "claims": [
      {
        "claim":               str,
        "supported":           "supported" | "partial" | "unsupported",
        "supporting_excerpt":  str,
        "source_file":         str,
        "confidence":          float 0-1
      }
    ],
    "verdict":             "supported" | "partially_supported" | "unsupported",
    "supported_count":     int,
    "partial_count":       int,
    "unsupported_count":   int,
    "overall_confidence":  float 0-1,
    "claim_count":         int
  }
"""
from __future__ import annotations

from typing import Any, Dict, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """You are a rigorous fact-checking agent for QA and software engineering documentation.

Your job:
1. Decompose the ANSWER into individual, concrete factual claims. Skip filler, meta-commentary, and opinions.
2. For each claim, search the SOURCE EXCERPTS to determine whether the claim is:
   - "supported"   — a source directly and explicitly backs the claim
   - "partial"     — a source partially supports it but with notable gaps or caveats
   - "unsupported" — no source excerpt corroborates the claim
3. For supported/partial claims, quote the most relevant source text and name the source file.

Rules:
- Extract ONLY concrete factual claims (numbers, names, behaviours, relationships, statuses).
- Never invent evidence. If you cannot find support, mark it unsupported.
- Be strict: "supported" requires the claim to be explicitly stated or directly derivable from source text.
- Output ONLY valid JSON — no prose, no markdown outside the JSON block.

Required JSON schema:
{
  "claims": [
    {
      "claim": "string — the extracted factual claim (max 200 chars)",
      "supported": "supported" | "partial" | "unsupported",
      "supporting_excerpt": "string — verbatim quote from source, or empty string",
      "source_file": "string — filename of supporting source, or empty string",
      "confidence": 0.0
    }
  ],
  "verdict": "supported" | "partially_supported" | "unsupported",
  "overall_confidence": 0.0
}"""


class FactCheckAgent(BaseAgent):
    name = "fact_check"
    description = "Verifies factual claims in an AI answer against retrieved source excerpts"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        # Build citation block from explicit citations + any RAG-retrieved context
        citation_parts = []
        for i, c in enumerate(task.extra.get("citations", [])):
            if not isinstance(c, dict):
                continue
            fname = c.get("filename", c.get("source_file", "unknown"))
            excerpt = c.get("excerpt", c.get("text", ""))
            if excerpt:
                citation_parts.append(f"[Source {i+1}: {fname}]\n{excerpt}")

        if rag_context:
            citation_parts.append(rag_context)

        citation_block = (
            "\n\n".join(citation_parts)
            if citation_parts
            else "(no sources provided — all claims will be unsupported)"
        )

        user_message = (
            f"ANSWER TO FACT-CHECK:\n{task.query}\n\n"
            f"SOURCE EXCERPTS:\n{citation_block}\n\n"
            "Decompose the answer into claims and check each against the sources. Return JSON only."
        )
        return _SYSTEM_PROMPT, user_message

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        data = extract_json(raw)
        if not isinstance(data, dict):
            data = {}

        raw_claims = data.get("claims", [])
        if not isinstance(raw_claims, list):
            raw_claims = []

        claims = []
        for c in raw_claims:
            if not isinstance(c, dict):
                continue
            sup = c.get("supported", "unsupported")
            if sup not in ("supported", "partial", "unsupported"):
                sup = "unsupported"
            claims.append({
                "claim":              str(c.get("claim", ""))[:400],
                "supported":          sup,
                "supporting_excerpt": str(c.get("supporting_excerpt", ""))[:400],
                "source_file":        str(c.get("source_file", "")),
                "confidence":         float(c.get("confidence", 0.0)),
            })

        supported_count   = sum(1 for c in claims if c["supported"] == "supported")
        partial_count     = sum(1 for c in claims if c["supported"] == "partial")
        unsupported_count = sum(1 for c in claims if c["supported"] == "unsupported")
        total = len(claims) or 1

        # Weighted confidence: supported=1.0, partial=0.5, unsupported=0.0
        overall_confidence = round(
            (supported_count * 1.0 + partial_count * 0.5) / total, 3
        )

        # Derive verdict (prefer agent-supplied if valid)
        verdict = data.get("verdict", "")
        if verdict not in ("supported", "partially_supported", "unsupported"):
            if unsupported_count == 0 and len(claims) > 0:
                verdict = "supported"
            elif supported_count > 0 or partial_count > 0:
                verdict = "partially_supported"
            else:
                verdict = "unsupported"

        return {
            "claims":             claims,
            "verdict":            verdict,
            "supported_count":    supported_count,
            "partial_count":      partial_count,
            "unsupported_count":  unsupported_count,
            "overall_confidence": overall_confidence,
            "claim_count":        len(claims),
        }
