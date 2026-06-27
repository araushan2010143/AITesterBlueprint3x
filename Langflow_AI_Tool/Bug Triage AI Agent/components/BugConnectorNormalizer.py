from langflow.custom import Component
from langflow.inputs import MessageTextInput
from langflow.template import Output
from langflow.schema.message import Message
import json


class BugConnectorNormalizer(Component):
    display_name = "Bug Connector & Normalizer"
    description = (
        "Detects the bug tracker source (Jira, GitHub, Azure DevOps, GitLab, Linear, YouTrack) "
        "from raw JSON/URL input and normalizes it to the Universal Canonical Bug Schema."
    )
    icon = "bug"
    name = "BugConnectorNormalizer"

    inputs = [
        MessageTextInput(
            name="raw_input",
            display_name="Raw Bug Input",
            info="Paste a bug JSON from any tracker — Jira, GitHub Issues, Azure DevOps, GitLab, Linear, YouTrack.",
        )
    ]

    outputs = [
        Output(display_name="Normalized Bug (Canonical)", name="normalized_bug", method="normalize")
    ]

    # ── Tracker detection ──────────────────────────────────────────────────────

    def _detect_tracker(self, data: dict, raw: str) -> str:
        raw_l = raw.lower()
        if "github.com" in raw_l or ("number" in data and "node_id" in data):
            return "github"
        if "dev.azure.com" in raw_l or "visualstudio.com" in raw_l or "System.WorkItemType" in str(data):
            return "azure_devops"
        if "gitlab.com" in raw_l or ("iid" in data and "project_id" in data):
            return "gitlab"
        if "linear.app" in raw_l or ("identifier" in data and "team" in data):
            return "linear"
        if "youtrack" in raw_l or ("idReadable" in data and "summary" in data):
            return "youtrack"
        if "atlassian.net" in raw_l or "jira" in raw_l or "fields" in data:
            return "jira"
        return "unknown"

    # ── Per-tracker normalizers ────────────────────────────────────────────────

    def _from_github(self, d: dict) -> dict:
        labels = [l.get("name", "") for l in d.get("labels", [])]
        priority = next((l for l in labels if l.lower() in ["critical","high","medium","low"]), "Unknown")
        env = next((l for l in labels if any(k in l.lower() for k in ["prod","staging","dev"])), "Unknown")
        component = next((l.split(":")[-1].strip() for l in labels if "area:" in l.lower() or "component:" in l.lower()), "Unknown")
        return {
            "bug_id": f"GH-{d.get('number','?')}",
            "tracker": "GitHub Issues",
            "title": d.get("title", ""),
            "description": d.get("body", ""),
            "comments": [c.get("body","") for c in d.get("comments_data", [])],
            "attachments": [],
            "labels": labels,
            "priority": priority,
            "severity": "Unknown",
            "status": "Open" if d.get("state") == "open" else "Closed",
            "assignee": (d.get("assignee") or {}).get("login", "Unassigned"),
            "reporter": (d.get("user") or {}).get("login", "Unknown"),
            "environment": env,
            "component": component,
            "created_at": d.get("created_at", ""),
            "updated_at": d.get("updated_at", ""),
            "url": d.get("html_url", ""),
            "custom_fields": {"milestone": (d.get("milestone") or {}).get("title")}
        }

    def _from_jira(self, d: dict) -> dict:
        f = d.get("fields", {})
        severity_field = f.get("customfield_10300")
        severity = severity_field.get("value") if isinstance(severity_field, dict) else "Unknown"
        return {
            "bug_id": d.get("key", "UNKNOWN"),
            "tracker": "Jira",
            "title": f.get("summary", ""),
            "description": str(f.get("description") or ""),
            "comments": [c.get("body","") for c in f.get("comment",{}).get("comments", [])],
            "attachments": [a.get("filename","") for a in f.get("attachment", [])],
            "labels": f.get("labels", []),
            "priority": (f.get("priority") or {}).get("name", "Unknown"),
            "severity": severity or "Unknown",
            "status": (f.get("status") or {}).get("name", "Unknown"),
            "assignee": (f.get("assignee") or {}).get("displayName", "Unassigned"),
            "reporter": (f.get("reporter") or {}).get("displayName", "Unknown"),
            "environment": f.get("environment") or "Unknown",
            "component": ", ".join(c.get("name","") for c in f.get("components",[])),
            "created_at": f.get("created", ""),
            "updated_at": f.get("updated", ""),
            "url": d.get("self","").split("/rest/")[0] + "/browse/" + d.get("key",""),
            "custom_fields": {"fix_versions": [v.get("name") for v in f.get("fixVersions", [])]}
        }

    def _from_azure_devops(self, d: dict) -> dict:
        f = d.get("fields", {})
        assignee = f.get("System.AssignedTo")
        reporter = f.get("System.CreatedBy")
        return {
            "bug_id": f"ADO-{d.get('id','?')}",
            "tracker": "Azure DevOps",
            "title": f.get("System.Title", ""),
            "description": f.get("System.Description") or f.get("Microsoft.VSTS.TCM.ReproSteps") or "",
            "comments": [],
            "attachments": [],
            "labels": [t.strip() for t in (f.get("System.Tags") or "").split(";") if t.strip()],
            "priority": str(f.get("Microsoft.VSTS.Common.Priority", "Unknown")),
            "severity": f.get("Microsoft.VSTS.Common.Severity") or "Unknown",
            "status": f.get("System.State", "Unknown"),
            "assignee": assignee.get("displayName","Unassigned") if isinstance(assignee, dict) else str(assignee or "Unassigned"),
            "reporter": reporter.get("displayName","Unknown") if isinstance(reporter, dict) else str(reporter or "Unknown"),
            "environment": f.get("System.IterationPath") or "Unknown",
            "component": f.get("System.AreaPath") or "Unknown",
            "created_at": f.get("System.CreatedDate", ""),
            "updated_at": f.get("System.ChangedDate", ""),
            "url": d.get("url", ""),
            "custom_fields": {"board_column": f.get("System.BoardColumn")}
        }

    def _from_gitlab(self, d: dict) -> dict:
        labels = d.get("labels", [])
        priority = next((l for l in labels if l.lower() in ["critical","high","medium","low"]), "Unknown")
        severity = next((l.split("::")[-1].strip() for l in labels if "severity::" in l.lower()), "Unknown")
        env = next((l.split("::")[-1].strip() for l in labels if "environment::" in l.lower()), "Unknown")
        component = next((l.split("::")[-1].strip() for l in labels if "component::" in l.lower()), "Unknown")
        assignees = d.get("assignees", [])
        return {
            "bug_id": f"GL-{d.get('iid', d.get('id','?'))}",
            "tracker": "GitLab Issues",
            "title": d.get("title", ""),
            "description": d.get("description", ""),
            "comments": [],
            "attachments": [],
            "labels": labels,
            "priority": priority,
            "severity": severity,
            "status": d.get("state", "Unknown"),
            "assignee": assignees[0].get("name","Unassigned") if assignees else "Unassigned",
            "reporter": (d.get("author") or {}).get("name", "Unknown"),
            "environment": env,
            "component": component,
            "created_at": d.get("created_at", ""),
            "updated_at": d.get("updated_at", ""),
            "url": d.get("web_url", ""),
            "custom_fields": {"milestone": (d.get("milestone") or {}).get("title")}
        }

    def _from_linear(self, d: dict) -> dict:
        priority_map = {0: "No Priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low"}
        labels = [l.get("name","") for l in d.get("labels", {}).get("nodes", [])]
        return {
            "bug_id": d.get("identifier", "LIN-?"),
            "tracker": "Linear",
            "title": d.get("title", ""),
            "description": d.get("description", ""),
            "comments": [],
            "attachments": [],
            "labels": labels,
            "priority": priority_map.get(d.get("priority", 0), "Unknown"),
            "severity": "Unknown",
            "status": (d.get("state") or {}).get("name", "Unknown"),
            "assignee": (d.get("assignee") or {}).get("name", "Unassigned"),
            "reporter": (d.get("creator") or {}).get("name", "Unknown"),
            "environment": next((l for l in labels if "prod" in l.lower()), "Unknown"),
            "component": (d.get("team") or {}).get("name", "Unknown"),
            "created_at": d.get("createdAt", ""),
            "updated_at": d.get("updatedAt", ""),
            "url": d.get("url", ""),
            "custom_fields": {"cycle": (d.get("cycle") or {}).get("name")}
        }

    def _from_youtrack(self, d: dict) -> dict:
        custom = {c.get("name",""): c.get("value") for c in d.get("customFields", []) if isinstance(c.get("value"), (str, int, float))}
        return {
            "bug_id": d.get("idReadable", d.get("id","YT-?")),
            "tracker": "YouTrack",
            "title": d.get("summary", ""),
            "description": d.get("description", ""),
            "comments": [c.get("text","") for c in d.get("comments", [])],
            "attachments": [a.get("name","") for a in d.get("attachments", [])],
            "labels": d.get("tags", []),
            "priority": custom.get("Priority", "Unknown"),
            "severity": custom.get("Type", "Unknown"),
            "status": (d.get("fields", {}).get("State") or {}).get("name", d.get("state", "Unknown")),
            "assignee": (d.get("assignee") or {}).get("fullName", "Unassigned"),
            "reporter": (d.get("reporter") or {}).get("fullName", "Unknown"),
            "environment": custom.get("Environment", "Unknown"),
            "component": custom.get("Subsystem", "Unknown"),
            "created_at": str(d.get("created", "")),
            "updated_at": str(d.get("updated", "")),
            "url": d.get("url", ""),
            "custom_fields": custom
        }

    def _from_unknown(self, d: dict, raw: str) -> dict:
        return {
            "bug_id": d.get("id", d.get("bug_id", d.get("key", "UNKNOWN"))),
            "tracker": "Unknown",
            "title": d.get("title", d.get("summary", d.get("name", raw[:80]))),
            "description": d.get("description", d.get("body", "")),
            "comments": [],
            "attachments": [],
            "labels": d.get("labels", d.get("tags", [])),
            "priority": d.get("priority", "Unknown"),
            "severity": d.get("severity", "Unknown"),
            "status": d.get("status", d.get("state", "Unknown")),
            "assignee": d.get("assignee", "Unassigned"),
            "reporter": d.get("reporter", d.get("author", "Unknown")),
            "environment": d.get("environment", "Unknown"),
            "component": d.get("component", "Unknown"),
            "created_at": d.get("created_at", d.get("created", "")),
            "updated_at": d.get("updated_at", d.get("updated", "")),
            "url": d.get("url", d.get("html_url", "")),
            "custom_fields": {}
        }

    # ── Entry point ────────────────────────────────────────────────────────────

    def normalize(self) -> Message:
        raw = self.raw_input
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            return Message(text=json.dumps({"error": f"Invalid JSON: {e}", "raw_preview": raw[:200]}, indent=2))

        tracker = self._detect_tracker(data, raw)
        dispatch = {
            "github":       self._from_github,
            "jira":         self._from_jira,
            "azure_devops": self._from_azure_devops,
            "gitlab":       self._from_gitlab,
            "linear":       self._from_linear,
            "youtrack":     self._from_youtrack,
        }
        fn = dispatch.get(tracker)
        canonical = fn(data) if fn else self._from_unknown(data, raw)
        out = json.dumps(canonical, indent=2, default=str)
        self.status = out
        return Message(text=out)
