from langflow.custom import Component
from langflow.inputs import MessageTextInput
from langflow.template import Output
from langflow.schema.message import Message
import json


class ConfidenceRouter(Component):
    display_name = "Confidence Router"
    description = (
        "Evaluates the LLM triage output's confidence score. "
        "Routes to AUTO-ACTION (≥0.80) or HUMAN-REVIEW (<0.80) queue and formats the final decision."
    )
    icon = "git-branch"
    name = "ConfidenceRouter"

    inputs = [
        MessageTextInput(
            name="triage_result",
            display_name="LLM Triage JSON",
            info="Structured JSON output from the LLM triage step",
        ),
        MessageTextInput(
            name="canonical_bug",
            display_name="Canonical Bug JSON",
            info="Normalized bug for reference in the final decision",
        ),
    ]

    outputs = [
        Output(display_name="Routing Decision", name="decision", method="route")
    ]

    HIGH_CONFIDENCE_THRESHOLD = 0.80

    def route(self) -> Message:
        try:
            triage = json.loads(self.triage_result)
        except json.JSONDecodeError as e:
            return Message(text=json.dumps({"error": f"Invalid triage JSON: {e}"}, indent=2))

        try:
            bug = json.loads(self.canonical_bug)
        except json.JSONDecodeError:
            bug = {}

        confidence = float(triage.get("confidence", 0.0))
        severity   = triage.get("severity", "Unknown")
        priority   = triage.get("priority", "Unknown")
        regression = triage.get("regression", False)

        # Force human review for critical regressions even at high confidence
        force_review = regression and severity.upper() in {"CRITICAL", "HIGH"}

        if confidence >= self.HIGH_CONFIDENCE_THRESHOLD and not force_review:
            routing = "AUTO_ACTION"
            actions = self._build_auto_actions(triage, bug)
            review_reason = None
        else:
            routing = "HUMAN_REVIEW"
            actions = []
            review_reason = (
                f"Confidence {confidence:.0%} below threshold {self.HIGH_CONFIDENCE_THRESHOLD:.0%}."
                if confidence < self.HIGH_CONFIDENCE_THRESHOLD
                else f"Critical regression detected — mandatory human review required."
            )

        # Slack/Teams notification payload
        notification = {
            "channel": "#bug-triage",
            "text": (
                f"🤖 *Bug Triaged* [{triage.get('priority','?')} / {triage.get('severity','?')}]\n"
                f"*{bug.get('tracker','?')} #{bug.get('bug_id','?')}* — {bug.get('title','')[:80]}\n"
                f"Confidence: {confidence:.0%} | Route: {routing}\n"
                f"Owner: {triage.get('recommended_owner','TBD')} | Action: {triage.get('recommended_action','TBD')}"
            ),
            "urgency": "high" if priority in {"P1","Urgent","Critical"} else "normal"
        }

        decision = {
            "routing":         routing,
            "confidence":      confidence,
            "review_reason":   review_reason,
            "auto_actions":    actions,
            "bug_id":          bug.get("bug_id"),
            "tracker":         bug.get("tracker"),
            "final_severity":  severity,
            "final_priority":  priority,
            "regression_flag": regression,
            "notification":    notification,
            "triage_summary":  {
                "severity":          triage.get("severity"),
                "priority":          triage.get("priority"),
                "recommended_owner": triage.get("recommended_owner"),
                "suggested_labels":  triage.get("suggested_labels", []),
                "recommended_action":triage.get("recommended_action"),
                "estimated_fix_priority": triage.get("estimated_fix_priority"),
                "customer_impact":   triage.get("customer_impact"),
                "business_impact":   triage.get("business_impact"),
            }
        }

        out = json.dumps(decision, indent=2)
        self.status = f"Route: {routing} | Confidence: {confidence:.0%}"
        return Message(text=out)

    def _build_auto_actions(self, triage: dict, bug: dict) -> list:
        actions = []
        actions.append({
            "action": "UPDATE_PRIORITY",
            "value": triage.get("priority"),
            "target": f"{bug.get('tracker')} #{bug.get('bug_id')}"
        })
        actions.append({
            "action": "UPDATE_SEVERITY",
            "value": triage.get("severity"),
            "target": f"{bug.get('tracker')} #{bug.get('bug_id')}"
        })
        if triage.get("recommended_owner"):
            actions.append({
                "action": "ASSIGN",
                "value": triage.get("recommended_owner"),
                "target": f"{bug.get('tracker')} #{bug.get('bug_id')}"
            })
        for label in triage.get("suggested_labels", []):
            actions.append({"action": "ADD_LABEL", "value": label})
        actions.append({
            "action": "NOTIFY_SLACK",
            "channel": "#bug-triage",
            "message": f"Auto-triaged {bug.get('bug_id')}: {triage.get('severity')} / {triage.get('priority')}"
        })
        return actions
