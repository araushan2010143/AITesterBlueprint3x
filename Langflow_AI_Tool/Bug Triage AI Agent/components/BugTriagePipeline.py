from langflow.custom import Component
from langflow.inputs import MessageTextInput
from langflow.template import Output
from langflow.schema.message import Message
import json, math, re, urllib.request, urllib.error, os
from collections import Counter


class BugTriagePipeline(Component):
    display_name = "Bug Triage Pipeline"
    description = (
        "All-in-one universal bug triage: paste raw JSON from any tracker "
        "(Jira, GitHub, Azure DevOps, GitLab, Linear, YouTrack) and get a full "
        "AI triage decision — severity, priority, RCA, duplicate detection, owner, actions."
    )
    icon = "bug"
    name = "BugTriagePipeline"

    inputs = [
        MessageTextInput(
            name="raw_bug_input",
            display_name="Raw Bug JSON",
            info="Paste raw bug JSON from any tracker: Jira, GitHub Issues, Azure DevOps, GitLab, Linear, YouTrack.",
        ),
        MessageTextInput(
            name="knowledge_base_json",
            display_name="Historical Bugs (JSON)",
            info='Paste contents of knowledge_base/historical_bugs.json here, or leave empty to skip duplicate detection.',
            value="",
        ),
        MessageTextInput(
            name="groq_api_key",
            display_name="Groq API Key",
            info="Your Groq API key from console.groq.com (gsk_...)",
            value="",
        ),
        MessageTextInput(
            name="groq_model",
            display_name="Groq Model",
            info="Groq model to use",
            value="llama-3.3-70b-versatile",
        ),
    ]

    outputs = [
        Output(display_name="Triage Decision", name="decision", method="run_pipeline")
    ]

    # ── Keyword tables (Risk Scorer) ──────────────────────────────────────────
    SECURITY_KW   = {"security","vulnerability","cve","injection","xss","csrf","sql injection","rce","auth bypass","unauthorized","breach","exploit","privilege escalation"}
    REVENUE_KW    = {"payment","checkout","purchase","order","transaction","billing","subscription","invoice","refund","stripe","paypal","cart"}
    INFRA_KW      = {"outage","down","unavailable","service failure","500","crash","database","redis","kafka","queue","timeout","memory leak","oom"}
    DATA_KW       = {"data loss","corrupt","missing data","deleted","wrong data","incorrect","stale","inconsistent","null pointer"}
    REGRESSION_KW = {"regression","was working","used to work","broke in","broke after","stopped working","previously","worked before","last release","after deploy","after update"}
    AUTH_KW       = {"login","logout","auth","authentication","authorization","sso","oauth","saml","session","jwt","token","2fa","mfa","password"}
    PROD_ENV      = {"production","prod","live","prd"}
    HIGH_COMP     = {"payment","checkout","auth","authentication","login","database","api","gateway","core"}
    STOP_WORDS    = {"the","a","an","is","it","in","on","at","to","of","and","or","for","with","this","that","was","are","be","been","by","from","as","not","but","have","has","had","we","i","you","he","she","they","do","does","did","can","will","should","would","could","may","might","shall","also","very","more","some","when","where","how","what","which","who","then","than","if","so","no","yes"}

    # ── Step 1: Detect & Normalize ────────────────────────────────────────────

    def _detect_tracker(self, d, raw):
        r = raw.lower()
        if "github.com" in r or ("number" in d and "node_id" in d): return "github"
        if "dev.azure.com" in r or "System.WorkItemType" in str(d): return "azure_devops"
        if "gitlab.com" in r or ("iid" in d and "project_id" in d): return "gitlab"
        if "linear.app" in r or ("identifier" in d and "team" in d): return "linear"
        if "youtrack" in r or ("idReadable" in d and "summary" in d): return "youtrack"
        if "atlassian.net" in r or "jira" in r or "fields" in d: return "jira"
        return "unknown"

    def _normalize(self, d, raw):
        tracker = self._detect_tracker(d, raw)
        if tracker == "github":
            labels = [l.get("name","") for l in d.get("labels",[])]
            prio = next((l for l in labels if l.lower() in ["critical","high","medium","low"]), "Unknown")
            env  = next((l for l in labels if any(k in l.lower() for k in ["prod","staging","dev"])), "Unknown")
            comp = next((l.split(":")[-1].strip() for l in labels if "area:" in l.lower() or "component:" in l.lower()), "Unknown")
            return {"bug_id": f"GH-{d.get('number','?')}", "tracker": "GitHub Issues",
                    "title": d.get("title",""), "description": d.get("body",""),
                    "comments": [c.get("body","") for c in d.get("comments_data",[])],
                    "labels": labels, "priority": prio, "severity": "Unknown",
                    "status": "Open" if d.get("state")=="open" else "Closed",
                    "assignee": (d.get("assignee") or {}).get("login","Unassigned"),
                    "reporter": (d.get("user") or {}).get("login","Unknown"),
                    "environment": env, "component": comp,
                    "created_at": d.get("created_at",""), "url": d.get("html_url",""), "custom_fields": {}}
        elif tracker == "jira":
            f = d.get("fields",{})
            sv = f.get("customfield_10300"); sv = sv.get("value") if isinstance(sv,dict) else "Unknown"
            return {"bug_id": d.get("key","?"), "tracker": "Jira",
                    "title": f.get("summary",""), "description": str(f.get("description") or ""),
                    "comments": [c.get("body","") for c in f.get("comment",{}).get("comments",[])],
                    "labels": f.get("labels",[]), "priority": (f.get("priority") or {}).get("name","Unknown"),
                    "severity": sv or "Unknown", "status": (f.get("status") or {}).get("name","Unknown"),
                    "assignee": (f.get("assignee") or {}).get("displayName","Unassigned"),
                    "reporter": (f.get("reporter") or {}).get("displayName","Unknown"),
                    "environment": f.get("environment") or "Unknown",
                    "component": ", ".join(c.get("name","") for c in f.get("components",[])),
                    "created_at": f.get("created",""), "url": d.get("self","").split("/rest/")[0]+"/browse/"+d.get("key",""),
                    "custom_fields": {}}
        elif tracker == "azure_devops":
            f = d.get("fields",{})
            asgn = f.get("System.AssignedTo"); rptr = f.get("System.CreatedBy")
            return {"bug_id": f"ADO-{d.get('id','?')}", "tracker": "Azure DevOps",
                    "title": f.get("System.Title",""),
                    "description": f.get("System.Description") or f.get("Microsoft.VSTS.TCM.ReproSteps") or "",
                    "comments": [], "labels": [t.strip() for t in (f.get("System.Tags") or "").split(";") if t.strip()],
                    "priority": str(f.get("Microsoft.VSTS.Common.Priority","Unknown")),
                    "severity": f.get("Microsoft.VSTS.Common.Severity") or "Unknown",
                    "status": f.get("System.State","Unknown"),
                    "assignee": asgn.get("displayName","Unassigned") if isinstance(asgn,dict) else str(asgn or "Unassigned"),
                    "reporter": rptr.get("displayName","Unknown") if isinstance(rptr,dict) else str(rptr or "Unknown"),
                    "environment": f.get("System.IterationPath") or "Unknown",
                    "component": f.get("System.AreaPath") or "Unknown",
                    "created_at": f.get("System.CreatedDate",""), "url": d.get("url",""), "custom_fields": {}}
        elif tracker == "gitlab":
            labels = d.get("labels",[])
            prio = next((l for l in labels if l.lower() in ["critical","high","medium","low"]), "Unknown")
            sv   = next((l.split("::")[-1].strip() for l in labels if "severity::" in l.lower()), "Unknown")
            env  = next((l.split("::")[-1].strip() for l in labels if "environment::" in l.lower()), "Unknown")
            comp = next((l.split("::")[-1].strip() for l in labels if "component::" in l.lower()), "Unknown")
            asgs = d.get("assignees",[])
            return {"bug_id": f"GL-{d.get('iid',d.get('id','?'))}", "tracker": "GitLab Issues",
                    "title": d.get("title",""), "description": d.get("description",""),
                    "comments": [], "labels": labels, "priority": prio, "severity": sv,
                    "status": d.get("state","Unknown"),
                    "assignee": asgs[0].get("name","Unassigned") if asgs else "Unassigned",
                    "reporter": (d.get("author") or {}).get("name","Unknown"),
                    "environment": env, "component": comp,
                    "created_at": d.get("created_at",""), "url": d.get("web_url",""), "custom_fields": {}}
        elif tracker == "linear":
            pm = {0:"No Priority",1:"Urgent",2:"High",3:"Medium",4:"Low"}
            labels = [l.get("name","") for l in d.get("labels",{}).get("nodes",[])]
            return {"bug_id": d.get("identifier","LIN-?"), "tracker": "Linear",
                    "title": d.get("title",""), "description": d.get("description",""),
                    "comments": [], "labels": labels,
                    "priority": pm.get(d.get("priority",0),"Unknown"), "severity": "Unknown",
                    "status": (d.get("state") or {}).get("name","Unknown"),
                    "assignee": (d.get("assignee") or {}).get("name","Unassigned"),
                    "reporter": (d.get("creator") or {}).get("name","Unknown"),
                    "environment": next((l for l in labels if "prod" in l.lower()), "Unknown"),
                    "component": (d.get("team") or {}).get("name","Unknown"),
                    "created_at": d.get("createdAt",""), "url": d.get("url",""), "custom_fields": {}}
        else:
            return {"bug_id": d.get("id",d.get("key","?")), "tracker": tracker.title(),
                    "title": d.get("title",d.get("summary",raw[:80])),
                    "description": d.get("description",d.get("body","")),
                    "comments": [], "labels": d.get("labels",[]),
                    "priority": d.get("priority","Unknown"), "severity": d.get("severity","Unknown"),
                    "status": d.get("status","Unknown"), "assignee": d.get("assignee","Unassigned"),
                    "reporter": d.get("reporter","Unknown"), "environment": d.get("environment","Unknown"),
                    "component": d.get("component","Unknown"), "created_at": d.get("created_at",""),
                    "url": d.get("url",""), "custom_fields": {}}

    # ── Step 2: Risk Scoring ──────────────────────────────────────────────────

    def _risk_score(self, bug):
        blob = " ".join([bug.get("title",""), bug.get("description",""),
                         " ".join(bug.get("labels",[])), bug.get("component","")]).lower()
        score = 0; evidence = []
        env = bug.get("environment","").lower()
        if any(e in env for e in self.PROD_ENV): score+=25; evidence.append("PROD env (+25)")
        elif "staging" in env: score+=10; evidence.append("Staging env (+10)")
        prio = bug.get("priority","").lower(); sev = bug.get("severity","").lower()
        if any(k in prio for k in ["critical","blocker","urgent","p0","p1","1"]): score+=20; evidence.append(f"Priority={bug['priority']} (+20)")
        elif any(k in prio for k in ["high","major","p2","2"]): score+=12; evidence.append(f"Priority={bug['priority']} (+12)")
        if any(k in sev for k in ["critical","blocker"]): score+=10; evidence.append(f"Severity={bug['severity']} (+10)")
        def hits(kw): return [k for k in kw if k in blob]
        sh=hits(self.SECURITY_KW); rh=hits(self.REVENUE_KW); ih=hits(self.INFRA_KW)
        dh=hits(self.DATA_KW);     rgh=hits(self.REGRESSION_KW); ah=hits(self.AUTH_KW)
        if sh:  score+=20; evidence.append(f"Security: {sh[:3]} (+20)")
        if rh:  score+=15; evidence.append(f"Revenue: {rh[:3]} (+15)")
        if ih:  score+=12; evidence.append(f"Infra: {ih[:3]} (+12)")
        if dh:  score+=10; evidence.append(f"Data: {dh[:3]} (+10)")
        if rgh: score+=8;  evidence.append(f"Regression: {rgh[:2]} (+8)")
        if ah:  score+=8;  evidence.append(f"Auth: {ah[:2]} (+8)")
        if any(h in bug.get("component","").lower() for h in self.HIGH_COMP): score+=7; evidence.append("High-risk component (+7)")
        score = min(score, 100)
        p = "P1" if score>=75 else ("P2" if score>=55 else ("P3" if score>=35 else "P4"))
        biz = [x for x in [
            "Revenue Loss" if rh else None,
            "Security Risk" if sh else None,
            "Service Availability" if ih else None,
            "Data Integrity" if dh else None,
        ] if x] or ["Operational"]
        return {
            "rule_based_priority": p,
            "risk_score": score,
            "is_regression": bool(rgh),
            "business_impact": biz,
            "triggered_rules": evidence,
            "sla_hours": {"P1":4,"P2":24,"P3":72,"P4":168}[p],
        }

    # ── Step 3: Duplicate Detection ───────────────────────────────────────────

    def _tokenize(self, text):
        toks = re.findall(r"[a-z0-9]+", text.lower())
        return [t for t in toks if t not in self.STOP_WORDS and len(t)>2]

    def _cosine(self, a, b):
        keys = set(a)&set(b)
        if not keys: return 0.0
        dot = sum(a[k]*b[k] for k in keys)
        return dot/(math.sqrt(sum(v**2 for v in a.values()))*math.sqrt(sum(v**2 for v in b.values()))+1e-9)

    def _tf(self, tokens):
        c=Counter(tokens); n=len(tokens) or 1
        return {k:v/n for k,v in c.items()}

    def _detect_duplicates(self, bug, kb_json):
        try:
            history = json.loads(kb_json) if kb_json.strip() else {}
            if isinstance(history, dict): history = history.get("bugs",[])
        except Exception: history=[]
        if not history: return {"duplicate_probability":0.0,"is_likely_duplicate":False,"similar_incidents":[],"recommended_action":"No knowledge base provided."}
        q = f"{bug.get('title','')} {bug.get('description','')} {' '.join(bug.get('labels',[]))}"
        qv = self._tf(self._tokenize(q)); matches=[]
        for p in history:
            pt = f"{p.get('title','')} {p.get('description','')} {p.get('root_cause','')} {p.get('component','')}"
            sim = self._cosine(qv, self._tf(self._tokenize(pt)))
            if sim>=0.15: matches.append({"bug_id":p.get("id","?"),"title":p.get("title",""),"similarity":round(sim,3),"status":p.get("status","?"),"root_cause":p.get("root_cause",""),"resolution":p.get("resolution","")})
        matches.sort(key=lambda x:x["similarity"],reverse=True); top=matches[:5]
        dp=min(round((top[0]["similarity"]*1.1),2) if top else 0.0,0.99)
        return {"duplicate_probability":dp,"is_likely_duplicate":dp>=0.75,"similar_incidents":top,
                "recommended_action":"Mark as duplicate." if dp>=0.75 else ("Review similar incidents." if top else "New issue.")}

    # ── Step 4: Groq LLM ─────────────────────────────────────────────────────

    def _call_groq(self, prompt_text, api_key, model):
        body = json.dumps({
            "model": model,
            "messages": [{"role":"user","content": prompt_text}],
            "temperature": 0.1,
            "max_tokens": 2048
        }).encode()
        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=body,
            headers={"Authorization":f"Bearer {api_key}","Content-Type":"application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
                return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            return json.dumps({"error": f"Groq API error {e.code}: {e.read().decode()[:200]}"})
        except Exception as e:
            return json.dumps({"error": str(e)})

    # ── Step 5: Confidence Routing ────────────────────────────────────────────

    def _route(self, triage, bug):
        conf = float(triage.get("confidence",0.0))
        sev  = triage.get("severity","Unknown")
        force_review = triage.get("regression",False) and sev.upper() in {"CRITICAL","HIGH"}
        if conf>=0.80 and not force_review:
            routing="AUTO_ACTION"
            actions=[
                {"action":"UPDATE_PRIORITY","value":triage.get("priority")},
                {"action":"UPDATE_SEVERITY","value":triage.get("severity")},
                {"action":"ASSIGN","value":triage.get("recommended_owner")},
                *[{"action":"ADD_LABEL","value":l} for l in triage.get("suggested_labels",[])],
                {"action":"NOTIFY_SLACK","channel":"#bug-triage","message":f"Auto-triaged {bug.get('bug_id')}: {sev}/{triage.get('priority')}"}
            ]
            review_reason=None
        else:
            routing="HUMAN_REVIEW"; actions=[]
            review_reason=(f"Confidence {conf:.0%} below 80% threshold." if conf<0.80
                          else "Critical regression — mandatory human review.")
        return {"routing":routing,"confidence":conf,"review_reason":review_reason,"auto_actions":actions,
                "final_severity":sev,"final_priority":triage.get("priority"),"regression_flag":triage.get("regression",False)}

    # ── Main pipeline ─────────────────────────────────────────────────────────

    def run_pipeline(self) -> Message:
        raw = self.raw_bug_input or ""
        # Input field takes priority; fall back to GROQ_API_KEY env var (set in HF Space secrets)
        api_key = self.groq_api_key or os.environ.get("GROQ_API_KEY", "")

        # Parse input
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            return Message(text=json.dumps({"error":f"Invalid JSON: {e}","tip":"Paste a valid bug JSON from any tracker."},indent=2))

        if not api_key:
            return Message(text=json.dumps({"error":"Groq API key not found. Add GROQ_API_KEY to HF Space secrets (Settings → Repository secrets) or paste it in the Groq API Key field."},indent=2))

        # Step 1 — Normalize
        canonical = self._normalize(data, raw)

        # Step 2 — Risk score
        risk = self._risk_score(canonical)

        # Step 3 — Duplicate detection
        dup = self._detect_duplicates(canonical, self.knowledge_base_json or "")

        # Step 4 — LLM triage
        prompt = f"""You are an expert Bug Triage AI Agent. Analyze this bug and return ONLY a valid JSON object.

## CANONICAL BUG
{json.dumps(canonical, indent=2)}

## RISK REPORT (rule-based)
{json.dumps(risk, indent=2)}

## DUPLICATE DETECTION
{json.dumps(dup, indent=2)}

Return ONLY this JSON (no markdown, no explanation):
{{
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "priority": "P1|P2|P3|P4",
  "confidence": 0.0-1.0,
  "regression": true|false,
  "regression_introduced_by": "version or null",
  "root_cause_category": "code_defect|configuration_error|infrastructure_failure|data_corruption|dependency_issue|race_condition|memory_leak|security_flaw|regression|ui_ux_issue|integration_failure|unknown",
  "root_cause_hypothesis": "1-2 sentence hypothesis",
  "customer_impact": "High|Medium|Low",
  "customer_impact_description": "concise user-facing impact",
  "business_impact": ["Revenue","Security","Availability","Data Integrity","Compliance","Operational"],
  "duplicate_probability": 0.0-1.0,
  "is_likely_duplicate": true|false,
  "related_issue_ids": ["list of similar bug IDs"],
  "recommended_owner": "team or role (reasoning)",
  "suggested_labels": ["label1","label2","label3"],
  "recommended_action": "AUTO_CLOSE_DUPLICATE|ASSIGN_AND_ESCALATE|ASSIGN_TO_TEAM|NEEDS_MORE_INFO|SECURITY_INCIDENT_RESPONSE|MARK_DUPLICATE",
  "action_rationale": "1-2 sentence rationale",
  "estimated_fix_priority": "Immediate (<4h)|This Sprint (<24h)|Next Sprint (<72h)|Backlog",
  "sla_breach_risk": true|false,
  "ai_notes": "any additional observations"
}}"""

        llm_raw = self._call_groq(prompt, api_key, self.groq_model or "llama-3.3-70b-versatile")

        # Parse LLM output — strip markdown if present
        llm_text = llm_raw.strip()
        if llm_text.startswith("```"):
            llm_text = re.sub(r"```[a-z]*\n?","",llm_text).strip().rstrip("```").strip()
        try:
            triage = json.loads(llm_text)
        except json.JSONDecodeError:
            triage = {"error":"LLM returned invalid JSON","raw":llm_text[:500],"confidence":0.0}

        # Step 5 — Route
        routing = self._route(triage, canonical)

        # Final output — compact view to avoid Langflow UI overflow
        conf = triage.get("confidence", 0.0)
        result = {
            "═══ BUG TRIAGE DECISION ═══": None,
            "bug_id":              canonical.get("bug_id"),
            "tracker":             canonical.get("tracker"),
            "title":               canonical.get("title","")[:120],
            "═══ AI TRIAGE ═══": None,
            "severity":            triage.get("severity", "?"),
            "priority":            triage.get("priority", "?"),
            "confidence":          f"{conf:.0%}",
            "regression":          triage.get("regression", False),
            "regression_by":       triage.get("regression_introduced_by"),
            "root_cause_category": triage.get("root_cause_category"),
            "root_cause":          triage.get("root_cause_hypothesis"),
            "customer_impact":     triage.get("customer_impact"),
            "business_impact":     triage.get("business_impact", []),
            "recommended_owner":   triage.get("recommended_owner"),
            "suggested_labels":    triage.get("suggested_labels", []),
            "recommended_action":  triage.get("recommended_action"),
            "action_rationale":    triage.get("action_rationale"),
            "fix_priority":        triage.get("estimated_fix_priority"),
            "sla_breach_risk":     triage.get("sla_breach_risk"),
            "ai_notes":            triage.get("ai_notes"),
            "═══ ROUTING ═══": None,
            "routing":             routing.get("routing"),
            "review_reason":       routing.get("review_reason"),
            "auto_actions":        routing.get("auto_actions", []),
            "═══ RISK SCORE ═══": None,
            "risk_score":          risk.get("risk_score"),
            "rule_based_priority": risk.get("rule_based_priority"),
            "is_regression":       risk.get("is_regression"),
            "sla_hours":           risk.get("sla_hours"),
            "triggered_rules":     risk.get("triggered_rules", []),
            "═══ DUPLICATES ═══": None,
            "duplicate_probability": dup.get("duplicate_probability"),
            "is_likely_duplicate": dup.get("is_likely_duplicate"),
            "similar_incidents":   [
                {"id": s["bug_id"], "sim": s["similarity"], "title": s["title"][:60]}
                for s in dup.get("similar_incidents", [])[:3]
            ],
        }
        # Remove section headers (None values) for clean JSON
        result = {k: v for k, v in result.items() if v is not None or k.startswith("═")}

        self.status = f"{routing.get('routing')} | {triage.get('severity','?')}/{triage.get('priority','?')} | conf={conf:.0%}"
        try:
            return Message(text=json.dumps(result, indent=2, default=str))
        except Exception as e:
            return Message(text=json.dumps({"error": str(e), "severity": triage.get("severity"), "priority": triage.get("priority")}, indent=2))
