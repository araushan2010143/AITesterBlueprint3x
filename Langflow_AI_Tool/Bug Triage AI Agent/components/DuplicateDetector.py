from langflow.custom import Component
from langflow.inputs import MessageTextInput
from langflow.template import Output
from langflow.schema.message import Message
import json
import math
import re
from collections import Counter


class DuplicateDetector(Component):
    display_name = "Duplicate Detector"
    description = (
        "RAG-lite duplicate detection: computes TF-IDF cosine similarity between the incoming bug "
        "and a historical knowledge base to surface similar past incidents."
    )
    icon = "copy"
    name = "DuplicateDetector"

    inputs = [
        MessageTextInput(
            name="canonical_bug",
            display_name="Canonical Bug JSON",
            info="Output from Bug Connector & Normalizer",
        ),
        MessageTextInput(
            name="knowledge_base",
            display_name="Historical Bugs Knowledge Base (JSON)",
            info="JSON array of past bugs: [{id, title, description, root_cause, resolution, status}]",
        ),
    ]

    outputs = [
        Output(display_name="Duplicate & Similar Bug Report", name="similar_bugs", method="detect")
    ]

    STOP_WORDS = {
        "the","a","an","is","it","in","on","at","to","of","and","or","for","with",
        "this","that","was","are","be","been","by","from","as","not","but","have",
        "has","had","we","i","you","he","she","they","do","does","did","can","will",
        "should","would","could","may","might","shall","also","very","more","some",
        "when","where","how","what","which","who","then","than","if","so","no","yes"
    }

    def _tokenize(self, text: str) -> list:
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        return [t for t in tokens if t not in self.STOP_WORDS and len(t) > 2]

    def _tf(self, tokens: list) -> dict:
        c = Counter(tokens)
        total = len(tokens) or 1
        return {k: v / total for k, v in c.items()}

    def _cosine(self, vec_a: dict, vec_b: dict) -> float:
        keys = set(vec_a) & set(vec_b)
        if not keys:
            return 0.0
        dot = sum(vec_a[k] * vec_b[k] for k in keys)
        mag_a = math.sqrt(sum(v**2 for v in vec_a.values()))
        mag_b = math.sqrt(sum(v**2 for v in vec_b.values()))
        return dot / (mag_a * mag_b + 1e-9)

    def detect(self) -> Message:
        try:
            bug = json.loads(self.canonical_bug)
        except json.JSONDecodeError as e:
            return Message(text=json.dumps({"error": f"Invalid canonical bug JSON: {e}"}, indent=2))

        try:
            history = json.loads(self.knowledge_base)
            if isinstance(history, dict):
                history = history.get("bugs", [])
        except json.JSONDecodeError:
            history = []

        query_text = f"{bug.get('title','')} {bug.get('description','')} {' '.join(bug.get('labels',[]))}"
        query_tokens = self._tokenize(query_text)
        query_vec = self._tf(query_tokens)

        matches = []
        for past in history:
            past_text = f"{past.get('title','')} {past.get('description','')} {past.get('root_cause','')} {past.get('component','')}"
            past_tokens = self._tokenize(past_text)
            past_vec = self._tf(past_tokens)
            sim = self._cosine(query_vec, past_vec)

            if sim >= 0.15:
                matches.append({
                    "bug_id":         past.get("id", "?"),
                    "title":          past.get("title", ""),
                    "similarity":     round(sim, 3),
                    "status":         past.get("status", "Unknown"),
                    "root_cause":     past.get("root_cause", ""),
                    "resolution":     past.get("resolution", ""),
                    "component":      past.get("component", ""),
                    "severity":       past.get("severity", ""),
                })

        matches.sort(key=lambda x: x["similarity"], reverse=True)
        top = matches[:5]

        # Compute duplicate probability from top-1 similarity
        dup_prob = round(top[0]["similarity"] * 1.1, 2) if top else 0.0
        dup_prob = min(dup_prob, 0.99)

        report = {
            "duplicate_probability":  dup_prob,
            "is_likely_duplicate":    dup_prob >= 0.75,
            "similar_incident_count": len(top),
            "similar_incidents":      top,
            "recommended_action": (
                "Mark as duplicate — high overlap with existing issue."
                if dup_prob >= 0.75 else
                "Review similar incidents for root cause hints."
                if top else
                "No similar incidents found — treat as new issue."
            )
        }

        out = json.dumps(report, indent=2)
        self.status = out
        return Message(text=out)
