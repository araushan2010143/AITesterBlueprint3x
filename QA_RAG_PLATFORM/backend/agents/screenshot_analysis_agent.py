"""
ScreenshotAnalysisAgent — multimodal vision agent for visual defect analysis.

Analyses screenshots of UI failures and produces:
  - Defect description from visual evidence
  - Affected UI components (buttons, forms, layouts)
  - Suggested reproduction steps
  - Severity estimate based on visual impact
  - Comparison with known defects via RAG

Input:
  task.query     — bug description or context (e.g. "Login page is broken")
  task.node_id   — Jira key (optional)
  task.extra     — {
                     "image_base64":  "...",     # base64-encoded image (PNG/JPEG)
                     "image_url":     "https://...",  # public URL to image (alternate)
                     "image_format":  "png | jpeg | webp",
                     "screen_name":   "Login Page",
                     "browser":       "Safari 17",
                     "os":            "macOS 15",
                     "viewport":      "1440x900"
                   }

Output schema:
  {
    "bug_id":               "KAN-42",
    "screen_name":          "Login Page",
    "visual_defect_found":  true,
    "defect_description":   "...",
    "affected_elements": [
      {"element": "Submit button", "issue": "Overlapping with error message text"}
    ],
    "severity_from_visual": "critical | high | medium | low",
    "confidence":           0.84,
    "reproduction_steps": [
      "Navigate to /login",
      "Enter valid credentials",
      "Click Submit"
    ],
    "visual_anomalies": [
      "Text truncated at viewport edge",
      "Z-index overlap on modal"
    ],
    "accessibility_issues": ["Missing alt text on logo", "Contrast ratio < 4.5:1"],
    "suggested_jira_title": "Login Submit button overlaps error text on Safari",
    "matched_defects":      [{"id": "KAN-12", "title": "...", "similarity": 0.78}]
  }

Vision model selection (in priority order):
  1. OpenAI GPT-4o  — if OPENAI_API_KEY is set (best vision quality)
  2. Anthropic claude-claude-sonnet-5  — if ANTHROPIC_API_KEY is set
  3. Text-only fallback  — analyzes task.query and RAG context without vision
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

logger = logging.getLogger(__name__)

_VISION_SYSTEM = """\
You are a senior QA engineer and UI/UX expert specialising in visual defect analysis.

You are given a screenshot of a UI state that may contain a defect. Analyse it carefully and
return a JSON object describing what you see.

Return a JSON object with these fields:

  bug_id                  — Jira key or empty string
  screen_name             — name of the screen or page shown
  visual_defect_found     — boolean: true if a visible defect is present
  defect_description      — detailed description of what is visually wrong (or "No visual defect found")
  affected_elements       — list of {"element", "issue"} objects:
                            element: the UI component (button, form, table, nav, modal, etc.)
                            issue: what is wrong with it visually
  severity_from_visual    — critical | high | medium | low
                            critical: page is unusable, content not visible, crash state
                            high: major feature blocked, misleading information
                            medium: degraded UX, minor functional issue visible
                            low: cosmetic only, alignment/colour issue
  confidence              — 0.0 to 1.0 confidence in this visual analysis
  reproduction_steps      — inferred steps to reproduce what is shown in the screenshot
  visual_anomalies        — list of strings describing visual irregularities:
                            layout breaks, overlaps, clipping, z-index issues, missing content
  accessibility_issues    — list of strings: contrast problems, missing labels, keyboard traps
  suggested_jira_title    — concise Jira ticket title describing the visual defect
  matched_defects         — list of {"id", "title", "similarity"} from RAG context

Return ONLY valid JSON — no prose, no code fences.
"""

_TEXT_ONLY_SYSTEM = """\
You are a senior QA engineer. Based on the bug description and similar past defects,
infer the likely visual defects without having an actual screenshot.

Return the same JSON schema as for visual analysis, but set confidence to 0.4 or lower
and note "No screenshot provided — inference only" in defect_description.
"""


def _call_openai_vision(image_b64: str, image_format: str, context: str) -> str:
    import os
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    mime = f"image/{image_format.lower().replace('jpg', 'jpeg')}"
    messages = [
        {"role": "system", "content": _VISION_SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": context},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime};base64,{image_b64}",
                        "detail": "high",
                    },
                },
            ],
        },
    ]
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        max_tokens=2048,
        temperature=0.2,
    )
    return resp.choices[0].message.content or ""


def _call_anthropic_vision(image_b64: str, image_format: str, context: str) -> str:
    import os
    import anthropic
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    mime = f"image/{image_format.lower().replace('jpg', 'jpeg')}"
    resp = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=2048,
        system=_VISION_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime,
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": context},
                ],
            }
        ],
    )
    return resp.content[0].text if resp.content else ""


def _call_vision(image_b64: str, image_format: str, context: str) -> Tuple[str, str]:
    """Try OpenAI → Anthropic → text-only. Returns (raw_text, model_used)."""
    import os

    if os.getenv("OPENAI_API_KEY"):
        try:
            return _call_openai_vision(image_b64, image_format, context), "gpt-4o"
        except Exception as exc:
            logger.warning("GPT-4o vision failed: %s", exc)

    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            return _call_anthropic_vision(image_b64, image_format, context), "claude-sonnet-5"
        except Exception as exc:
            logger.warning("Anthropic vision failed: %s", exc)

    return "", "none"


class ScreenshotAnalysisAgent(BaseAgent):
    name = "screenshot_analysis_agent"
    description = "Multimodal visual defect analysis — identifies UI bugs from screenshots using GPT-4o/Claude vision"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        extra = task.extra or {}
        parts = []
        if task.node_id:
            parts.append(f"BUG ID: {task.node_id}")
        if task.query:
            parts.append(f"BUG CONTEXT:\n{task.query}")
        if extra.get("screen_name"):
            parts.append(f"SCREEN: {extra['screen_name']}")
        if extra.get("browser"):
            parts.append(f"BROWSER: {extra['browser']}")
        if extra.get("os"):
            parts.append(f"OS: {extra['os']}")
        if extra.get("viewport"):
            parts.append(f"VIEWPORT: {extra['viewport']}")
        if rag_context:
            parts.append(f"SIMILAR PAST DEFECTS:\n{rag_context}")
        return _VISION_SYSTEM, "\n\n".join(parts)

    def run(self, task, run_id=None):
        """
        Override BaseAgent.run() to inject vision call before LLM.
        Falls back to standard text-only BaseAgent flow if no image provided.
        """
        import uuid, time
        from backend.agents.schemas import AgentResult, Citation

        run_id = run_id or str(uuid.uuid4())
        t0 = time.time()
        extra = task.extra or {}

        # Gather text context (RAG + graph) via parent helpers
        rag_ctx, citations = self._gather_rag_context(task)
        graph_ctx = self._gather_graph_context(task)
        _, context_msg = self.build_prompt(task, rag_ctx, graph_ctx)

        image_b64 = extra.get("image_base64", "")
        image_format = extra.get("image_format", "png")

        # Handle image URL: download and base64-encode
        if not image_b64 and extra.get("image_url"):
            try:
                import urllib.request
                with urllib.request.urlopen(extra["image_url"], timeout=15) as resp:
                    image_b64 = base64.b64encode(resp.read()).decode()
                image_format = extra["image_url"].rsplit(".", 1)[-1].split("?")[0] or "png"
            except Exception as exc:
                logger.warning("Failed to download image URL: %s", exc)

        raw_text = ""
        model_used = "text-only"

        if image_b64:
            raw_text, model_used = _call_vision(image_b64, image_format, context_msg)

        if not raw_text:
            # No image or vision call failed — use text-only LLM
            from backend.agents.base_agent import call_llm
            raw_text, _ = call_llm(_TEXT_ONLY_SYSTEM, context_msg, temperature=0.2)
            model_used = "text-only"

        output = self.parse_output(raw_text, task)
        output["_vision_model"] = model_used

        tokens = 0  # Vision API tokens not easily countable in unified way
        latency = int((time.time() - t0) * 1000)
        self._persist(run_id, task, "done", output, tokens, latency)

        return AgentResult(
            run_id=run_id,
            agent_name=self.name,
            task_type=task.task_type,
            status="done",
            output=output,
            citations=citations,
            tokens_used=tokens,
            latency_ms=latency,
        )

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        extra = task.extra or {}
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("bug_id",               task.node_id or "")
        parsed.setdefault("screen_name",           extra.get("screen_name", ""))
        parsed.setdefault("visual_defect_found",   False)
        parsed.setdefault("defect_description",    "No visual analysis available")
        parsed.setdefault("affected_elements",     [])
        parsed.setdefault("severity_from_visual",  "medium")
        parsed.setdefault("confidence",            0.0)
        parsed.setdefault("reproduction_steps",    [])
        parsed.setdefault("visual_anomalies",      [])
        parsed.setdefault("accessibility_issues",  [])
        parsed.setdefault("suggested_jira_title",  "")
        parsed.setdefault("matched_defects",       [])
        return parsed
