from langflow.custom import Component
from langflow.inputs import MessageTextInput
from langflow.template import Output
from langflow.schema.message import Message
import json
import re


class RiskScoringEngine(Component):
    display_name = "Risk Scoring Engine"
    description = (
        "Deterministic rule-based engine. Scores a canonical bug on severity, business impact, "
        "environment criticality, and regression probability — no LLM required."
    )
    icon = "shield-alert"
    name = "RiskScoringEngine"

    inputs = [
        MessageTextInput(
            name="canonical_bug",
            display_name="Canonical Bug JSON",
            info="Output from Bug Connector & Normalizer",
        )
    ]

    outputs = [
        Output(display_name="Risk Analysis Report", name="risk_report", method="score")
    ]

    # ── Keyword rule tables ────────────────────────────────────────────────────

    SECURITY_KW   = {"security","vulnerability","cve","injection","xss","csrf","sql injection","rce","auth bypass","unauthorized","breach","exploit","token","privilege escalation"}
    REVENUE_KW    = {"payment","checkout","purchase","order","transaction","billing","subscription","invoice","refund","stripe","paypal","cart"}
    INFRA_KW      = {"outage","down","unavailable","service failure","500","crash","database","db","redis","kafka","queue","timeout","memory leak","oom"}
    DATA_KW       = {"data loss","corrupt","missing data","deleted","wrong data","incorrect","stale","inconsistent","null pointer","undefined"}
    REGRESSION_KW = {"regression","was working","used to work","broke in","broke after","stopped working","previously","worked before","last release","after deploy","after update"}
    AUTH_KW       = {"login","logout","auth","authentication","authorization","sso","oauth","saml","session","jwt","token","2fa","mfa","password"}

    PROD_ENV = {"production","prod","live","prd"}
    HIGH_COMPONENTS = {"payment","checkout","auth","authentication","login","database","api","gateway","core"}

    def _text_blob(self, bug: dict) -> str:
        return " ".join([
            bug.get("title",""),
            bug.get("description",""),
            " ".join(bug.get("labels",[])),
            bug.get("component",""),
            " ".join(bug.get("comments",[])[:3])
        ]).lower()

    def _hits(self, blob: str, kw_set: set) -> list:
        return [k for k in kw_set if k in blob]

    def score(self) -> Message:
        try:
            bug = json.loads(self.canonical_bug)
        except json.JSONDecodeError as e:
            return Message(text=json.dumps({"error": f"Invalid canonical bug JSON: {e}"}, indent=2))

        blob = self._text_blob(bug)
        score = 0
        evidence = []

        # ── Environment scoring ────────────────────────────────────────────────
        env = bug.get("environment","").lower()
        if any(e in env for e in self.PROD_ENV):
            score += 25
            evidence.append("PROD environment (+25)")
        elif "staging" in env:
            score += 10
            evidence.append("Staging environment (+10)")

        # ── Priority / Severity from tracker ──────────────────────────────────
        prio = bug.get("priority","").lower()
        sev  = bug.get("severity","").lower()
        if any(k in prio for k in ["critical","blocker","urgent","p0","p1","1"]):
            score += 20; evidence.append(f"Tracker priority={bug['priority']} (+20)")
        elif any(k in prio for k in ["high","major","p2","2"]):
            score += 12; evidence.append(f"Tracker priority={bug['priority']} (+12)")
        if any(k in sev for k in ["critical","blocker"]):
            score += 10; evidence.append(f"Tracker severity={bug['severity']} (+10)")

        # ── Keyword scoring ────────────────────────────────────────────────────
        sec_hits = self._hits(blob, self.SECURITY_KW)
        if sec_hits:
            score += 20; evidence.append(f"Security keywords: {sec_hits} (+20)")

        rev_hits = self._hits(blob, self.REVENUE_KW)
        if rev_hits:
            score += 15; evidence.append(f"Revenue-path keywords: {rev_hits} (+15)")

        infra_hits = self._hits(blob, self.INFRA_KW)
        if infra_hits:
            score += 12; evidence.append(f"Infra/service keywords: {infra_hits} (+12)")

        data_hits = self._hits(blob, self.DATA_KW)
        if data_hits:
            score += 10; evidence.append(f"Data-integrity keywords: {data_hits} (+10)")

        reg_hits = self._hits(blob, self.REGRESSION_KW)
        is_regression = bool(reg_hits)
        if is_regression:
            score += 8; evidence.append(f"Regression keywords: {reg_hits} (+8)")

        auth_hits = self._hits(blob, self.AUTH_KW)
        if auth_hits:
            score += 8; evidence.append(f"Auth-path keywords: {auth_hits} (+8)")

        # ── Component risk ─────────────────────────────────────────────────────
        comp = bug.get("component","").lower()
        if any(h in comp for h in self.HIGH_COMPONENTS):
            score += 7; evidence.append(f"High-risk component: {bug['component']} (+7)")

        # ── Normalize to 0-100 ─────────────────────────────────────────────────
        score = min(score, 100)

        # ── Map score → P-level ────────────────────────────────────────────────
        if score >= 75:
            p_level, risk_label = "P1", "CRITICAL"
        elif score >= 55:
            p_level, risk_label = "P2", "HIGH"
        elif score >= 35:
            p_level, risk_label = "P3", "MEDIUM"
        else:
            p_level, risk_label = "P4", "LOW"

        # ── Customer & business impact ─────────────────────────────────────────
        customer_impact = "High" if any(k in blob for k in self.REVENUE_KW | self.AUTH_KW) else ("Medium" if score >= 40 else "Low")
        business_impact = []
        if rev_hits:  business_impact.append("Revenue Loss")
        if sec_hits:  business_impact.append("Security / Compliance Risk")
        if infra_hits: business_impact.append("Service Availability")
        if data_hits: business_impact.append("Data Integrity")
        if not business_impact: business_impact.append("Operational")

        report = {
            "rule_based_priority":  p_level,
            "risk_score":           score,
            "risk_level":           risk_label,
            "is_regression":        is_regression,
            "customer_impact":      customer_impact,
            "business_impact":      business_impact,
            "triggered_rules":      evidence,
            "recommended_sla_hours": {"P1": 4, "P2": 24, "P3": 72, "P4": 168}[p_level],
            "high_risk_signals": {
                "security":  bool(sec_hits),
                "revenue":   bool(rev_hits),
                "infra":     bool(infra_hits),
                "data_loss": bool(data_hits),
                "auth":      bool(auth_hits),
            }
        }

        out = json.dumps(report, indent=2)
        self.status = out
        return Message(text=out)
