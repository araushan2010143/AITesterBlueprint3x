"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Github, Play, Download, FileCode, CheckCircle,
  XCircle, Clock, RefreshCw, Trash2, ChevronRight,
  Zap, AlertTriangle, BookOpen, GitPullRequest, RotateCcw,
  ShieldCheck, ShieldAlert, ShieldX, Cpu, GitBranch, Cloud, Lock,
  Folder, Server, Package, HardDrive, ScanSearch, ArrowRight,
  SplitSquareHorizontal, Bell, Pencil, Copy,
} from "lucide-react";
import MigrationResultViewer from "@/components/MigrationResultViewer";
import TestResultsPanel from "@/components/TestResultsPanel";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@/components/MonacoEditor"), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────────

type SourceId =
  | "github" | "gitlab" | "bitbucket" | "bitbucket_server"
  | "azure_devops" | "codecommit" | "gitea"
  | "zip" | "folder"
  | "s3" | "azure_blob" | "gcs"
  | "google_drive" | "onedrive" | "sharepoint"
  | "jenkins" | "github_actions" | "gitlab_ci" | "teamcity" | "bamboo";

type FileStatus = {
  filename: string;
  status: "pending" | "running" | "done" | "failed";
  stage: number;
  stageName: string;
  confidence?: number;
  language?: string;
  framework?: string;
  error?: string;
};

type ActiveJob = {
  jobId: string;
  sourceName: string;
  total: number;
  files: FileStatus[];
  jobStatus: "running" | "done" | "partial" | "failed";
  succeeded: number;
  failed: number;
};

type HistoryJob = {
  id: string;
  status: string;
  source_type: string;
  source_name: string;
  file_count: number;
  completed_files: number;
  failed_files: number;
  created_at: string;
};

type FileResult = {
  file: string;
  status: "done" | "failed";
  result?: any;
  error?: string;
};

type Standard = { id: string; name: string; filename: string; chunk_count: number; created_at: string };

type ValidationResult = {
  method: string;
  passed: boolean | null;
  error_count: number;
  errors: string[];
};

const STAGE_LABELS = ["", "Detecting", "AST Parse", "Business Logic", "POMs", "Spec", "Validate"];

const CONFIDENCE_COLOR = (n: number) =>
  n >= 80 ? "#10b981" : n >= 60 ? "#f59e0b" : "#ef4444";

// ── Source catalog ─────────────────────────────────────────────────────────────

const SOURCE_GROUPS: { label: string; sources: { id: SourceId; icon: React.ReactNode; label: string }[] }[] = [
  {
    label: "Git Repositories",
    sources: [
      { id: "github",           icon: <Github size={12} />,    label: "GitHub"           },
      { id: "gitlab",           icon: <GitBranch size={12} />, label: "GitLab"           },
      { id: "bitbucket",        icon: <GitBranch size={12} />, label: "Bitbucket Cloud"  },
      { id: "bitbucket_server", icon: <Server size={12} />,    label: "Bitbucket Server" },
      { id: "azure_devops",     icon: <FileCode size={12} />,  label: "Azure DevOps"     },
      { id: "codecommit",       icon: <Cloud size={12} />,     label: "AWS CodeCommit"   },
      { id: "gitea",            icon: <Server size={12} />,    label: "Gitea / Forgejo"  },
    ],
  },
  {
    label: "Local & Archive",
    sources: [
      { id: "zip",    icon: <Upload size={12} />,   label: "ZIP Upload"   },
      { id: "folder", icon: <Folder size={12} />,   label: "Local Folder" },
    ],
  },
  {
    label: "Cloud Storage",
    sources: [
      { id: "s3",         icon: <Cloud size={12} />,     label: "AWS S3"               },
      { id: "azure_blob", icon: <Cloud size={12} />,     label: "Azure Blob"           },
      { id: "gcs",        icon: <Cloud size={12} />,     label: "Google Cloud Storage" },
    ],
  },
  {
    label: "File Sharing",
    sources: [
      { id: "google_drive", icon: <HardDrive size={12} />, label: "Google Drive" },
      { id: "onedrive",     icon: <HardDrive size={12} />, label: "OneDrive"     },
      { id: "sharepoint",   icon: <Package size={12} />,   label: "SharePoint"   },
    ],
  },
  {
    label: "CI/CD Artifacts",
    sources: [
      { id: "jenkins",        icon: <Zap size={12} />,       label: "Jenkins"         },
      { id: "github_actions", icon: <Github size={12} />,    label: "GitHub Actions"  },
      { id: "gitlab_ci",      icon: <GitBranch size={12} />, label: "GitLab CI"       },
      { id: "teamcity",       icon: <Zap size={12} />,       label: "TeamCity"        },
      { id: "bamboo",         icon: <Zap size={12} />,       label: "Bamboo"          },
    ],
  },
];

type SourceCfg = {
  placeholder: string;
  hint: string;
  tokenLabel?: string;
  tokenHint?: string;
  isUrl: boolean;
};

const SOURCE_CONFIG: Record<SourceId, SourceCfg> = {
  // Git repos
  github: {
    placeholder: "https://github.com/owner/repo",
    hint: "Public repos need no token. For private repos enter a Personal Access Token.",
    tokenLabel: "Personal Access Token (optional for private)",
    tokenHint: "Needs repo read scope — Settings → Developer settings → Tokens",
    isUrl: true,
  },
  gitlab: {
    placeholder: "https://gitlab.com/namespace/repo  or  https://your-gitlab.company.com/ns/repo",
    hint: "Works with gitlab.com and self-hosted GitLab instances.",
    tokenLabel: "Private Token / PAT (optional for private)",
    tokenHint: "Settings → Access Tokens → read_repository scope",
    isUrl: true,
  },
  bitbucket: {
    placeholder: "https://bitbucket.org/workspace/repo",
    hint: "Bitbucket Cloud (bitbucket.org). For private repos use username:app_password.",
    tokenLabel: "username:app_password (optional)",
    tokenHint: "Personal Settings → App passwords → Repository read",
    isUrl: true,
  },
  bitbucket_server: {
    placeholder: "https://bitbucket.company.com/projects/PROJ/repos/REPO",
    hint: "Self-hosted Bitbucket Server or Data Center. Also accepts /scm/PROJ/REPO format.",
    tokenLabel: "username:password  or  Personal Access Token",
    tokenHint: "User Settings → Personal Access Tokens → Repository Read",
    isUrl: true,
  },
  azure_devops: {
    placeholder: "https://dev.azure.com/org/project/_git/repo",
    hint: "Azure DevOps Services. Private projects require a Personal Access Token.",
    tokenLabel: "Personal Access Token",
    tokenHint: "User Settings → Personal Access Tokens → Code (Read) scope",
    isUrl: true,
  },
  codecommit: {
    placeholder: "https://git-codecommit.us-east-1.amazonaws.com/v1/repos/my-repo",
    hint: "AWS CodeCommit. Clones via HTTPS using IAM Git credentials (shallow clone).",
    tokenLabel: "username:password  (IAM HTTPS Git credentials)",
    tokenHint: "AWS Console → IAM → User → Security credentials → HTTPS Git credentials for CodeCommit",
    isUrl: true,
  },
  gitea: {
    placeholder: "https://gitea.company.com/owner/repo  or  https://try.gitea.io/owner/repo",
    hint: "Self-hosted Gitea, Forgejo, or Gogs instance.",
    tokenLabel: "Personal Access Token (optional)",
    tokenHint: "Settings → Applications → Generate Token → repository read",
    isUrl: true,
  },
  // Local
  zip: { placeholder: "", hint: "", isUrl: false },
  folder: { placeholder: "", hint: "", isUrl: false },
  // Cloud storage
  s3: {
    placeholder: "s3://bucket/path/archive.zip  or  https://bucket.s3.amazonaws.com/archive.zip",
    hint: "Public S3 bucket or presigned URL. Generate a presigned URL: AWS Console → S3 → object → Share with pre-signed URL.",
    isUrl: true,
  },
  azure_blob: {
    placeholder: "https://myaccount.blob.core.windows.net/container/archive.zip[?sv=...SAS...]",
    hint: "Public blob URL or SAS URL. Generate SAS: Azure Portal → Storage account → Shared access signature.",
    tokenLabel: "SAS token  or  Bearer access token (optional)",
    tokenHint: "SAS token starts with sv=; Bearer token from Azure AD",
    isUrl: true,
  },
  gcs: {
    placeholder: "https://storage.googleapis.com/bucket/archive.zip  or signed URL",
    hint: "Public GCS object or signed URL. For private: gcloud storage sign-url or Console → Cloud Storage → Generate signed URL.",
    tokenLabel: "Bearer access token (optional for private objects)",
    tokenHint: "gcloud auth print-access-token",
    isUrl: true,
  },
  // Sharing
  google_drive: {
    placeholder: "https://drive.google.com/file/d/{file-id}/view",
    hint: "Public Google Drive sharing link. File must be shared 'Anyone with the link' and must be a .zip archive.",
    isUrl: true,
  },
  onedrive: {
    placeholder: "https://1drv.ms/...  or  https://onedrive.live.com/download?...",
    hint: "OneDrive direct download link (not the view page). Click Download in OneDrive, then copy that URL.",
    isUrl: true,
  },
  sharepoint: {
    placeholder: "https://company.sharepoint.com/sites/site/Shared%20Documents/archive.zip",
    hint: "SharePoint direct file URL or sharing link. For private files provide an access token.",
    tokenLabel: "Bearer access token (optional for private)",
    tokenHint: "Microsoft Graph OAuth2 access token",
    isUrl: true,
  },
  // CI/CD
  jenkins: {
    placeholder: "https://jenkins.company.com/job/MyJob  or  .../lastSuccessfulBuild/artifact/tests.zip",
    hint: "Job URL auto-downloads the last successful build artifact ZIP. Or paste the direct artifact URL.",
    tokenLabel: "username:api_token",
    tokenHint: "User icon → Configure → API Token → Add new Token",
    isUrl: true,
  },
  github_actions: {
    placeholder: "https://github.com/owner/repo/actions/runs/{run_id}",
    hint: "GitHub Actions workflow run URL. Downloads the first artifact from that run.",
    tokenLabel: "Personal Access Token",
    tokenHint: "Needs actions:read + repo scope",
    isUrl: true,
  },
  gitlab_ci: {
    placeholder: "https://gitlab.com/owner/repo/-/jobs/{job_id}/artifacts",
    hint: "GitLab CI job artifacts URL. The job must have published artifacts.",
    tokenLabel: "Private Token / PAT",
    tokenHint: "Settings → Access Tokens → read_api scope",
    isUrl: true,
  },
  teamcity: {
    placeholder: "https://teamcity.company.com/repository/download/{buildTypeId}/lastSuccessful/tests.zip",
    hint: "TeamCity artifact direct download URL. Use guestAuth for anonymous or provide credentials.",
    tokenLabel: "username:password  or  Bearer token",
    tokenHint: "Or use /guestAuth/ URL path for guest-accessible builds",
    isUrl: true,
  },
  bamboo: {
    placeholder: "https://bamboo.company.com/artifact/PROJ-PLAN/shared/archive.zip",
    hint: "Bamboo artifact direct download URL.",
    tokenLabel: "username:password",
    tokenHint: "Bamboo local user credentials",
    isUrl: true,
  },
};

const SOURCE_LABEL: Record<SourceId, string> = {
  github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket Cloud",
  bitbucket_server: "Bitbucket Server", azure_devops: "Azure DevOps",
  codecommit: "AWS CodeCommit", gitea: "Gitea",
  zip: "ZIP", folder: "Folder",
  s3: "AWS S3", azure_blob: "Azure Blob", gcs: "GCS",
  google_drive: "Google Drive", onedrive: "OneDrive", sharepoint: "SharePoint",
  jenkins: "Jenkins", github_actions: "GitHub Actions", gitlab_ci: "GitLab CI",
  teamcity: "TeamCity", bamboo: "Bamboo",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ValidationBadge({ v }: { v?: ValidationResult }) {
  if (!v || v.method === "skipped") return null;
  const passed = v.passed;
  const [open, setOpen] = useState(false);
  const Icon = passed === true ? ShieldCheck : passed === false ? ShieldAlert : ShieldX;
  const color = passed === true ? "#10b981" : passed === false ? "#ef4444" : "#f59e0b";
  const label = passed === true ? "TS valid" : passed === null ? "TS unknown" : `${v.error_count} TS error${v.error_count !== 1 ? "s" : ""}`;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", color, fontSize: 11 }} title={v.method}>
        <Icon size={12} /> {label}
      </button>
      <AnimatePresence>
        {open && v.errors.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ position: "absolute", right: 0, top: "100%", zIndex: 20, background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12, minWidth: 280, maxHeight: 160, overflowY: "auto" }}>
            {v.errors.slice(0, 8).map((e, i) => (
              <p key={i} style={{ fontSize: 11, color: "#e5e7eb", fontFamily: "monospace", marginBottom: 4, lineHeight: 1.4 }}>{e}</p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AstBadge({ method }: { method?: string }) {
  if (!method || method === "llm") return null;
  return (
    <span title={`Parsed via ${method}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#a78bfa", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 4, padding: "1px 5px" }}>
      <Cpu size={9} /> AST
    </span>
  );
}

function StandardsPanel() {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/migration/standards");
    const d = await r.json();
    setStandards(d.standards || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("name", file.name.replace(/\.[^.]+$/, ""));
    await fetch("/api/migration/standards", { method: "POST", body: form });
    await load();
    setUploading(false);
  };

  const remove = async (id: string) => {
    await fetch(`/api/migration/standards/${id}`, { method: "DELETE" });
    setStandards((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div style={{ background: "#0d111b", border: "1px solid rgba(124,58,237,0.15)", borderRadius: 12, marginBottom: 20 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#9ca3af" }}>
        <BookOpen size={14} color="#7c3aed" />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#e5e7eb", flex: 1, textAlign: "left" }}>
          Company Coding Standards
          {standards.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: "#7c3aed" }}>{standards.length} uploaded</span>}
        </span>
        <span style={{ fontSize: 11, color: "#4b5563" }}>V3 — injected into Stage 4+5</span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}><ChevronRight size={13} color="#4b5563" /></motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 16px 16px" }}>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>Upload .md or .txt files with naming conventions, test patterns, or style guides. Relevant sections are injected into POM generation and Playwright synthesis.</p>
              {standards.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {standards.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <BookOpen size={12} color="#7c3aed" />
                      <span style={{ fontSize: 12, color: "#e5e7eb", flex: 1 }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: "#4b5563" }}>{s.chunk_count} sections</span>
                      <button onClick={() => remove(s.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#374151" }}><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
              <input ref={fileRef} type="file" accept=".md,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, color: "#a78bfa", cursor: "pointer", fontSize: 12 }}>
                <Upload size={12} /> {uploading ? "Uploading…" : "Upload Standard"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type PRPlatform = "github" | "gitlab" | "azure" | "bitbucket";

const PR_PLATFORMS: { id: PRPlatform; label: string; tokenHint: string; repoHint: string; extraFields?: { key: string; label: string; placeholder: string }[] }[] = [
  { id: "github",    label: "GitHub",         tokenHint: "Personal Access Token (repo scope)",                        repoHint: "owner/repository" },
  { id: "gitlab",    label: "GitLab",          tokenHint: "Private Token / PAT (read_repository + api scope)",         repoHint: "Full GitLab repo URL", extraFields: [{ key: "gitlab_url", label: "GitLab base URL", placeholder: "https://gitlab.com" }] },
  { id: "azure",     label: "Azure DevOps",    tokenHint: "Personal Access Token (Code: Read & Write)",                repoHint: "Full Azure DevOps git URL (https://dev.azure.com/.../_git/repo)" },
  { id: "bitbucket", label: "Bitbucket Cloud", tokenHint: "username:app_password  or  OAuth bearer token",            repoHint: "Full Bitbucket URL (https://bitbucket.org/workspace/repo)" },
];

function PRPanel({ jobId, results }: { jobId: string; results: FileResult[] }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<PRPlatform>("github");
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [error, setError] = useState("");

  const plt = PR_PLATFORMS.find(p => p.id === platform)!;
  const doneCount = results.filter(r => r.status === "done").length;

  const submit = async () => {
    if (!token || !repo) return;
    setLoading(true); setError(""); setPrUrl("");
    const form = new FormData();
    form.append("base_branch", baseBranch);

    let endpoint = "";
    if (platform === "github") {
      form.append("github_token", token);
      form.append("repo", repo);
      endpoint = `/api/migration/jobs/${jobId}/create-pr`;
    } else if (platform === "gitlab") {
      form.append("gitlab_token", token);
      form.append("repo", repo);
      form.append("gitlab_url", extra["gitlab_url"] || "https://gitlab.com");
      endpoint = `/api/migration/jobs/${jobId}/create-gitlab-mr`;
    } else if (platform === "azure") {
      form.append("azure_token", token);
      form.append("repo_url", repo);
      endpoint = `/api/migration/jobs/${jobId}/create-azure-pr`;
    } else {
      form.append("bitbucket_token", token);
      form.append("repo_url", repo);
      endpoint = `/api/migration/jobs/${jobId}/create-bitbucket-pr`;
    }

    try {
      const r = await fetch(endpoint, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) { setError(d.detail || "Failed"); return; }
      setPrUrl(d.pr_url || d.mr_url || "");
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const prLabel = platform === "gitlab" ? "MR" : "PR";

  return (
    <div style={{ background: "#0d111b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, marginTop: 16 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer" }}>
        <GitPullRequest size={14} color="#7c3aed" />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#e5e7eb", flex: 1, textAlign: "left" }}>
          Create Pull Request / MR <span style={{ color: "#4b5563", fontWeight: 400 }}>— push {doneCount} migrated file{doneCount !== 1 ? "s" : ""}</span>
        </span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}><ChevronRight size={13} color="#4b5563" /></motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Platform selector */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PR_PLATFORMS.map(p => (
                  <button key={p.id} onClick={() => { setPlatform(p.id); setPrUrl(""); setError(""); }}
                    style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid",
                      background: platform === p.id ? "rgba(124,58,237,0.15)" : "transparent",
                      borderColor: platform === p.id ? "rgba(124,58,237,0.45)" : "rgba(255,255,255,0.08)",
                      color: platform === p.id ? "#a78bfa" : "#6b7280" }}>
                    {p.label}
                  </button>
                ))}
              </div>

              {prUrl ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8 }}>
                  <CheckCircle size={16} color="#10b981" />
                  <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>{prLabel} created → {prUrl}</a>
                </div>
              ) : (
                <>
                  <input value={token} onChange={e => setToken(e.target.value)} type="password"
                    placeholder={plt.tokenHint}
                    style={{ padding: "9px 12px", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "#e5e7eb", outline: "none" }} />
                  <input value={repo} onChange={e => setRepo(e.target.value)}
                    placeholder={plt.repoHint}
                    style={{ padding: "9px 12px", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "#e5e7eb", outline: "none" }} />
                  {plt.extraFields?.map(f => (
                    <input key={f.key} value={extra[f.key] || ""} onChange={e => setExtra(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ padding: "9px 12px", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "#e5e7eb", outline: "none" }} />
                  ))}
                  <input value={baseBranch} onChange={e => setBaseBranch(e.target.value)}
                    placeholder="Base branch (default: main)"
                    style={{ padding: "9px 12px", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "#e5e7eb", outline: "none" }} />
                  {error && <p style={{ fontSize: 12, color: "#ef4444" }}>{error}</p>}
                  <button onClick={submit} disabled={loading || !token || !repo}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 16px", background: loading ? "#374151" : "#7c3aed", border: "none", borderRadius: 8, color: "#fff", cursor: loading || !token || !repo ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: !token || !repo ? 0.5 : 1 }}>
                    {loading ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw size={13} /></motion.div> Creating {prLabel}…</> : <><GitPullRequest size={13} /> Create {platform === "gitlab" ? "Merge Request" : "Pull Request"}</>}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VersionHistory({ jobId }: { jobId: string }) {
  const [versions, setVersions] = useState<{ version: number; created_at: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/migration/jobs/${jobId}/versions`);
    const d = await r.json();
    setVersions(d.versions || []);
  }, [jobId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/migration/jobs/${jobId}/versions`, { method: "POST" });
    await load();
    setSaving(false);
  };

  const restore = async (v: number) => {
    await fetch(`/api/migration/jobs/${jobId}/versions/${v}/restore`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div style={{ background: "#0d111b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, marginTop: 16 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer" }}>
        <RotateCcw size={14} color="#7c3aed" />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#e5e7eb", flex: 1, textAlign: "left" }}>
          Version History
          {versions.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: "#4b5563" }}>{versions.length} snapshot{versions.length !== 1 ? "s" : ""}</span>}
        </span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}><ChevronRight size={13} color="#4b5563" /></motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 16px 16px" }}>
              <button onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 7, color: "#a78bfa", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
                {saving ? "Saving…" : "Save snapshot"}
              </button>
              {versions.length === 0 && <p style={{ fontSize: 12, color: "#4b5563" }}>No snapshots yet. Save one before re-running to allow rollback.</p>}
              {versions.map((v) => (
                <div key={v.version} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 24 }}>v{v.version}</span>
                  <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>{new Date(v.created_at).toLocaleString()}</span>
                  <button onClick={() => restore(v.version)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, color: "#6b7280", cursor: "pointer", fontSize: 11 }}>
                    <RotateCcw size={9} /> Restore
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RetryButton({
  jobId,
  failedCount,
  onRetryStarted,
}: {
  jobId: string;
  failedCount: number;
  onRetryStarted: (newJobId: string, sourceName: string, fileCount: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const retry = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/migration/jobs/${jobId}/retry-failed`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Retry failed");
      onRetryStarted(d.job_id, d.source_name, d.file_count);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={retry}
        disabled={loading}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(245,158,11,0.3)",
          background: "rgba(245,158,11,0.08)", color: "#f59e0b",
          cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500,
        }}
      >
        {loading
          ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw size={13} /></motion.div> Starting retry…</>
          : <><RefreshCw size={13} /> Retry {failedCount} failed file{failedCount !== 1 ? "s" : ""}</>
        }
      </button>
      {error && <p style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

function StageDots({ stage, status }: { stage: number; status: FileStatus["status"] }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const done = stage > i || status === "done";
        const active = stage === i && status === "running";
        const col = done ? "#7c3aed" : active ? "#a78bfa" : "#374151";
        return (
          <motion.div key={i}
            animate={active ? { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] } : {}}
            transition={active ? { duration: 0.9, repeat: Infinity } : {}}
            title={STAGE_LABELS[i]}
            style={{ width: 8, height: 8, borderRadius: "50%", background: col, border: active ? "1px solid #a78bfa" : "none" }} />
        );
      })}
    </div>
  );
}

function FileRow({ f }: { f: FileStatus }) {
  const statusIcon =
    f.status === "done" ? <CheckCircle size={14} color="#10b981" /> :
    f.status === "failed" ? <XCircle size={14} color="#ef4444" /> :
    f.status === "running" ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}><RefreshCw size={14} color="#7c3aed" /></motion.div> :
    <Clock size={14} color="#4b5563" />;

  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: f.status === "running" ? "rgba(124,58,237,0.04)" : "transparent" }}>
      {statusIcon}
      <span style={{ flex: 1, fontSize: 13, color: "#e5e7eb", fontFamily: "monospace" }}>{f.filename}</span>
      {f.language && <span style={{ fontSize: 11, color: "#6b7280", minWidth: 40 }}>{f.language}</span>}
      {f.status === "running" && <span style={{ fontSize: 11, color: "#a78bfa", minWidth: 100 }}>{f.stageName}</span>}
      {f.status === "done" && f.confidence !== undefined && (
        <span style={{ fontSize: 12, fontWeight: 700, color: CONFIDENCE_COLOR(f.confidence), minWidth: 40 }}>{f.confidence}%</span>
      )}
      {f.status === "failed" && (
        <span style={{ fontSize: 11, color: "#ef4444", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.error}</span>
      )}
      <StageDots stage={f.stage} status={f.status} />
    </motion.div>
  );
}

function DiffViewer({ original, generated, filename }: { original: string; generated: string; filename: string }) {
  const origLines = original.split("\n");
  const genLines = generated.split("\n");
  const lineStyle = (i: number, side: "orig" | "gen"): React.CSSProperties => ({
    display: "flex", alignItems: "flex-start", gap: 0, minHeight: 18,
    background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
  });
  const numStyle: React.CSSProperties = {
    minWidth: 36, padding: "0 8px", fontSize: 10, color: "#374151",
    fontFamily: "monospace", userSelect: "none", textAlign: "right",
    borderRight: "1px solid rgba(255,255,255,0.05)", flexShrink: 0,
  };
  const codeStyle: React.CSSProperties = {
    padding: "0 10px", fontSize: 11, color: "#d1d5db", fontFamily: "monospace",
    whiteSpace: "pre", flex: 1, overflow: "hidden", textOverflow: "ellipsis",
    lineHeight: "18px",
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
      {/* Left: original */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "6px 12px", background: "rgba(244,63,94,0.06)", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 10, fontWeight: 700, color: "#f43f5e", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
          <XCircle size={9} /> ORIGINAL · {filename}
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
          {origLines.map((line, i) => (
            <div key={i} style={lineStyle(i, "orig")}>
              <span style={numStyle}>{i + 1}</span>
              <span style={{ ...codeStyle, color: "#9ca3af" }}>{line || " "}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Right: generated */}
      <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ padding: "6px 12px", background: "rgba(16,185,129,0.06)", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 10, fontWeight: 700, color: "#10b981", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle size={9} /> PLAYWRIGHT · spec.ts
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
          {genLines.map((line, i) => (
            <div key={i} style={lineStyle(i, "gen")}>
              <span style={numStyle}>{i + 1}</span>
              <span style={codeStyle}>{line || " "}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpandableResult({ fr }: { fr: FileResult }) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"result" | "diff" | "edit">("result");
  const [editedCode, setEditedCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const conf = fr.result?.confidence_score ?? 0;
  const sa = fr.result?.source_analysis ?? {};
  const hasDiff = fr.status === "done" && fr.result?.source_preview && fr.result?.spec_ts;

  const initEdit = () => {
    if (!editedCode && fr.result?.spec_ts) setEditedCode(fr.result.spec_ts);
    setViewMode("edit");
  };

  const downloadEdited = () => {
    const code = editedCode || fr.result?.spec_ts || "";
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fr.file.replace(/\.[^.]+$/, ".spec.ts");
    a.click();
  };

  const copyEdited = () => {
    navigator.clipboard.writeText(editedCode || fr.result?.spec_ts || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#e5e7eb", textAlign: "left" }}>
        {fr.status === "done" ? <CheckCircle size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
        <span style={{ flex: 1, fontSize: 13, fontFamily: "monospace" }}>{fr.file}</span>
        {fr.status === "done" && (
          <>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{sa.language} · {sa.framework}</span>
            <AstBadge method={fr.result?.ast_method} />
            <ValidationBadge v={fr.result?.validation} />
            <span style={{ fontSize: 13, fontWeight: 700, color: CONFIDENCE_COLOR(conf), marginLeft: 4 }}>{conf}%</span>
          </>
        )}
        {fr.status === "failed" && <span style={{ fontSize: 11, color: "#ef4444" }}>Failed</span>}
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}><ChevronRight size={14} color="#4b5563" /></motion.div>
      </button>
      <AnimatePresence>
        {open && fr.status === "done" && fr.result && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 16 }}>
              {/* View mode tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => setViewMode("result")}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid",
                    background: viewMode === "result" ? "rgba(124,58,237,0.12)" : "transparent",
                    borderColor: viewMode === "result" ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.08)",
                    color: viewMode === "result" ? "#a78bfa" : "#6b7280" }}>
                  <FileCode size={11} /> Generated Code
                </button>
                {hasDiff && (
                  <button onClick={() => setViewMode("diff")}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid",
                      background: viewMode === "diff" ? "rgba(59,130,246,0.12)" : "transparent",
                      borderColor: viewMode === "diff" ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)",
                      color: viewMode === "diff" ? "#3b82f6" : "#6b7280" }}>
                    <SplitSquareHorizontal size={11} /> Side-by-Side Diff
                  </button>
                )}
                {fr.result?.spec_ts && (
                  <button onClick={initEdit}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid",
                      background: viewMode === "edit" ? "rgba(16,185,129,0.12)" : "transparent",
                      borderColor: viewMode === "edit" ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.08)",
                      color: viewMode === "edit" ? "#10b981" : "#6b7280" }}>
                    <Pencil size={11} /> Edit Code
                  </button>
                )}
                {/* Download / Copy actions in edit mode */}
                {viewMode === "edit" && (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button onClick={copyEdited}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: copied ? "#10b981" : "#6b7280" }}>
                      <Copy size={10} /> {copied ? "Copied!" : "Copy"}
                    </button>
                    <button onClick={downloadEdited}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(124,58,237,0.3)", background: "rgba(124,58,237,0.08)", color: "#a78bfa" }}>
                      <Download size={10} /> Download .ts
                    </button>
                  </div>
                )}
              </div>

              {viewMode === "result" ? (
                <MigrationResultViewer result={fr.result} />
              ) : viewMode === "diff" ? (
                <DiffViewer
                  original={fr.result.source_preview || ""}
                  generated={fr.result.spec_ts || ""}
                  filename={fr.file}
                />
              ) : (
                <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <MonacoEditor
                    value={editedCode || fr.result.spec_ts || ""}
                    onChange={setEditedCode}
                    language="typescript"
                    height="460px"
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
        {open && fr.status === "failed" && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 16 }}>
              <p style={{ fontSize: 13, color: "#ef4444", fontFamily: "monospace" }}>{fr.error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryRow({ job, onOpen }: { job: HistoryJob; onOpen: (id: string) => void }) {
  const statusColor = job.status === "done" ? "#10b981" : job.status === "partial" ? "#f59e0b" : job.status === "failed" ? "#ef4444" : "#6b7280";
  const d = new Date(job.created_at);
  const ago = Math.round((Date.now() - d.getTime()) / 60000);
  const timeStr = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.round(ago / 60)}h ago` : d.toLocaleDateString();
  const srcLabel = SOURCE_LABEL[job.source_type as SourceId] ?? job.source_type ?? "Unknown";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
      whileHover={{ background: "rgba(124,58,237,0.05)" }}
      onClick={() => onOpen(job.id)}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.source_name}</div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{srcLabel} · {timeStr}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{job.completed_files}/{job.file_count} files</div>
        <div style={{ fontSize: 11, color: statusColor, textTransform: "capitalize" }}>{job.status}</div>
      </div>
      <ChevronRight size={14} color="#4b5563" />
    </motion.div>
  );
}

// ── Source selector component ──────────────────────────────────────────────────

function SourceSelector({ value, onChange }: { value: SourceId; onChange: (id: SourceId) => void }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {SOURCE_GROUPS.map((group) => (
        <div key={group.label} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            {group.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {group.sources.map(({ id, icon, label }) => (
              <button key={id}
                onClick={() => onChange(id)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                  fontSize: 12, fontWeight: 500,
                  border: value === id ? "1px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.07)",
                  background: value === id ? "rgba(124,58,237,0.12)" : "#111827",
                  color: value === id ? "#a78bfa" : "#6b7280",
                  transition: "all 0.12s",
                }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MigrationPage() {
  const [tab, setTab] = useState<"new" | "history">("new");
  const [sourceType, setSourceType] = useState<SourceId>("zip");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [repoBranch, setRepoBranch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [completedResults, setCompletedResults] = useState<FileResult[] | null>(null);

  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [openHistoryJob, setOpenHistoryJob] = useState<string | null>(null);
  const [historyResults, setHistoryResults] = useState<Record<string, FileResult[]>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const evtSourceRef = useRef<EventSource | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/migration/jobs");
      const d = await r.json();
      setHistory(d.jobs || []);
    } catch { } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  // ── Page refresh recovery — reconnect to any in-progress job ──────────────
  useEffect(() => {
    const savedId = sessionStorage.getItem("migration_active_job");
    if (!savedId) return;
    fetch(`/api/migration/jobs/${savedId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.id) { sessionStorage.removeItem("migration_active_job"); return; }
        const toFileStatus = (r: FileResult): FileStatus => ({
          filename: r.file,
          status: r.status === "done" ? "done" : "failed",
          stage: r.status === "done" ? 5 : 0,
          stageName: "",
          confidence: r.result?.confidence_score,
          language: r.result?.source_analysis?.language,
          framework: r.result?.source_analysis?.framework,
          error: r.error,
        });
        const files: FileStatus[] = (d.results || []).map(toFileStatus);
        setActiveJob({
          jobId: savedId,
          sourceName: d.source_name,
          total: d.file_count,
          files,
          jobStatus: d.status === "running" ? "running" : d.status,
          succeeded: d.completed_files,
          failed: d.failed_files,
        });
        if (d.status === "running") {
          subscribeToJob(savedId);
        } else {
          setCompletedResults(d.results || []);
          sessionStorage.removeItem("migration_active_job");
        }
      })
      .catch(() => sessionStorage.removeItem("migration_active_job"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSourceChange = (id: SourceId) => {
    setSourceType(id);
    setUploadError("");
    setRepoUrl("");
    setRepoToken("");
    setRepoBranch("");
    setSelectedFile(null);
    setFolderFiles(null);
  };

  // ── Subscribe to SSE job stream ────────────────────────────────────────────

  const subscribeToJob = (jobId: string) => {
    sessionStorage.setItem("migration_active_job", jobId);
    if (evtSourceRef.current) evtSourceRef.current.close();
    const es = new EventSource(`/api/migration/jobs/${jobId}/stream`);
    evtSourceRef.current = es;

    es.onmessage = (e) => {
      const evt = JSON.parse(e.data);
      if (evt.type === "ping") return;
      if (evt.type === "job_start") setActiveJob((p) => p ? { ...p, total: evt.total } : p);
      if (evt.type === "file_start") {
        setActiveJob((p) => {
          if (!p) return p;
          const files = [...p.files];
          if (!files.find((f) => f.filename === evt.file))
            files.push({ filename: evt.file, status: "pending", stage: 0, stageName: "" });
          return { ...p, files };
        });
      }
      if (evt.type === "stage") {
        setActiveJob((p) => p ? { ...p, files: p.files.map((f) => f.filename === evt.file ? { ...f, status: "running", stage: evt.stage, stageName: evt.stage_name } : f) } : p);
      }
      if (evt.type === "file_done") {
        setActiveJob((p) => p ? { ...p, files: p.files.map((f) => f.filename === evt.file ? { ...f, status: "done", stage: 5, stageName: "", confidence: evt.confidence, language: evt.language, framework: evt.framework } : f) } : p);
      }
      if (evt.type === "file_failed") {
        setActiveJob((p) => p ? { ...p, files: p.files.map((f) => f.filename === evt.file ? { ...f, status: "failed", stage: 0, stageName: "", error: evt.error } : f) } : p);
      }
      if (evt.type === "job_done") {
        es.close();
        sessionStorage.removeItem("migration_active_job");
        setActiveJob((p) => p ? { ...p, jobStatus: evt.status, succeeded: evt.succeeded, failed: evt.failed } : p);
        fetch(`/api/migration/jobs/${jobId}`).then((r) => r.json()).then((d) => setCompletedResults(d.results || []));
      }
    };
    es.onerror = () => {
      es.close();
      setActiveJob((p) => p && p.jobStatus === "running" ? { ...p, jobStatus: "failed" } : p);
    };
  };

  // ── Start migration job ────────────────────────────────────────────────────

  const startJob = async () => {
    setUploadError("");
    setActiveJob(null);
    setCompletedResults(null);

    const cfg = SOURCE_CONFIG[sourceType];

    // ── Folder: POST multiple files to /jobs/files ──
    if (sourceType === "folder") {
      if (!folderFiles || folderFiles.length === 0) {
        setUploadError("Please select a folder");
        return;
      }
      setUploading(true);
      const form = new FormData();
      for (const f of folderFiles) form.append("files", f);
      if (webhookUrl.trim()) form.append("webhook_url", webhookUrl.trim());
      if (notifyEmail.trim()) form.append("notify_email", notifyEmail.trim());
      try {
        const r = await fetch("/api/migration/jobs/files", { method: "POST", body: form });
        if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Failed"); }
        const d = await r.json();
        setUploading(false);
        setActiveJob({ jobId: d.job_id, sourceName: d.source_name, total: d.file_count, files: [], jobStatus: "running", succeeded: 0, failed: 0 });
        subscribeToJob(d.job_id);
      } catch (err: any) {
        setUploadError(err.message || "Upload failed");
        setUploading(false);
      }
      return;
    }

    // ── ZIP upload ──
    if (sourceType === "zip") {
      if (!selectedFile) { setUploadError("Please select a ZIP file"); return; }
      setUploading(true);
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("source_type_hint", "zip");
      if (webhookUrl.trim()) form.append("webhook_url", webhookUrl.trim());
      if (notifyEmail.trim()) form.append("notify_email", notifyEmail.trim());
      try {
        const r = await fetch("/api/migration/jobs", { method: "POST", body: form });
        if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Failed"); }
        const d = await r.json();
        setUploading(false);
        setActiveJob({ jobId: d.job_id, sourceName: d.source_name, total: d.file_count, files: [], jobStatus: "running", succeeded: 0, failed: 0 });
        subscribeToJob(d.job_id);
      } catch (err: any) {
        setUploadError(err.message || "Upload failed");
        setUploading(false);
      }
      return;
    }

    // ── URL-based sources ──
    if (!repoUrl.trim()) { setUploadError("Please enter a URL"); return; }
    setUploading(true);
    const form = new FormData();
    form.append("repo_url", repoUrl.trim());
    form.append("source_type_hint", sourceType);
    if (repoToken.trim()) form.append("repo_token", repoToken.trim());
    if (repoBranch.trim()) form.append("repo_branch", repoBranch.trim());
    if (webhookUrl.trim()) form.append("webhook_url", webhookUrl.trim());
    if (notifyEmail.trim()) form.append("notify_email", notifyEmail.trim());
    try {
      const r = await fetch("/api/migration/jobs", { method: "POST", body: form });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Failed to create job"); }
      const d = await r.json();
      setUploading(false);
      setActiveJob({ jobId: d.job_id, sourceName: d.source_name, total: d.file_count, files: [], jobStatus: "running", succeeded: 0, failed: 0 });
      subscribeToJob(d.job_id);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
      setUploading(false);
    }
  };

  const openHistoryDetail = async (id: string) => {
    setOpenHistoryJob((prev) => (prev === id ? null : id));
    if (!historyResults[id]) {
      const r = await fetch(`/api/migration/jobs/${id}`);
      const d = await r.json();
      setHistoryResults((prev) => ({ ...prev, [id]: d.results || [] }));
    }
  };

  const deleteJob = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/migration/jobs/${id}`, { method: "DELETE" });
    setHistory((prev) => prev.filter((j) => j.id !== id));
    if (openHistoryJob === id) setOpenHistoryJob(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".zip")) setSelectedFile(f);
    else setUploadError("Please drop a .zip file");
  };

  const jobDone = activeJob && activeJob.jobStatus !== "running";
  const avgConf = completedResults
    ? Math.round(completedResults.filter((r) => r.status === "done").reduce((s, r) => s + (r.result?.confidence_score ?? 0), 0) / Math.max(1, completedResults.filter((r) => r.status === "done").length))
    : 0;

  const cfg = SOURCE_CONFIG[sourceType];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 960, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(225,29,72,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RefreshCw size={18} color="#e11d48" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Migration Studio</h1>
            <span style={{ fontSize: 12, color: "#6b7280" }}>V3 — 20 enterprise sources · AST parsing · TypeScript validation · PR auto-generation</span>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "#10b981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, padding: "2px 8px", letterSpacing: "0.06em" }}>V3</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#111827", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {(["new", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "7px 20px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: tab === t ? "#7c3aed" : "transparent", color: tab === t ? "#fff" : "#6b7280", transition: "all 0.15s" }}>
            {t === "new" ? "New Migration" : "History"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── New Migration tab ── */}
        {tab === "new" && (
          <motion.div key="new" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            {!activeJob && <StandardsPanel />}

            {/* Pre-migration Scanner promo */}
            {!activeJob && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", borderRadius: 10, marginBottom: 16 }}>
                <ScanSearch size={15} color="#3b82f6" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 600 }}>New: Project Scanner</span>
                  <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>Analyse framework, locator quality & readiness score before migrating</span>
                </div>
                <a href="/scanner" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#3b82f6", textDecoration: "none", whiteSpace: "nowrap" }}>
                  Scan First <ArrowRight size={11} />
                </a>
              </div>
            )}

            {!activeJob && (
              <>
                {/* Grouped source selector */}
                <SourceSelector value={sourceType} onChange={handleSourceChange} />

                {/* ZIP drop zone */}
                {sourceType === "zip" && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? "#7c3aed" : selectedFile ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 14, padding: "48px 32px", textAlign: "center", cursor: "pointer",
                      background: dragOver ? "rgba(124,58,237,0.06)" : selectedFile ? "rgba(124,58,237,0.04)" : "#0d111b",
                      transition: "all 0.2s", marginBottom: 16,
                    }}>
                    <input ref={fileInputRef} type="file" accept=".zip" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} />
                    <Upload size={32} color={selectedFile ? "#7c3aed" : "#374151"} style={{ margin: "0 auto 12px" }} />
                    {selectedFile ? (
                      <>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#a78bfa", marginBottom: 4 }}>{selectedFile.name}</p>
                        <p style={{ fontSize: 12, color: "#6b7280" }}>{(selectedFile.size / 1024).toFixed(0)} KB — click to change</p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>Drop your test suite ZIP here</p>
                        <p style={{ fontSize: 12, color: "#4b5563" }}>Java · Python · C# · TypeScript · Robot · Gherkin · up to 50 files</p>
                      </>
                    )}
                  </div>
                )}

                {/* Local folder picker */}
                {sourceType === "folder" && (
                  <div
                    onClick={() => folderInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${folderFiles ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 14, padding: "48px 32px", textAlign: "center", cursor: "pointer",
                      background: folderFiles ? "rgba(124,58,237,0.04)" : "#0d111b",
                      transition: "all 0.2s", marginBottom: 16,
                    }}>
                    <input
                      ref={folderInputRef}
                      type="file"
                      // @ts-ignore — webkitdirectory is non-standard but widely supported
                      webkitdirectory=""
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) setFolderFiles(Array.from(files));
                      }}
                    />
                    <Folder size={32} color={folderFiles ? "#7c3aed" : "#374151"} style={{ margin: "0 auto 12px" }} />
                    {folderFiles ? (
                      <>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#a78bfa", marginBottom: 4 }}>{folderFiles.length} file{folderFiles.length !== 1 ? "s" : ""} selected</p>
                        <p style={{ fontSize: 12, color: "#6b7280" }}>Test files will be automatically detected — click to change folder</p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>Select a local test folder</p>
                        <p style={{ fontSize: 12, color: "#4b5563" }}>Your entire project folder — non-test files are filtered out automatically</p>
                      </>
                    )}
                  </div>
                )}

                {/* URL-based sources */}
                {cfg.isUrl && (() => {
                  const isGitSource = ["github","gitlab","bitbucket","bitbucket_server","azure_devops","codecommit","gitea"].includes(sourceType);
                  return (
                    <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      <input
                        type="text"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder={cfg.placeholder}
                        style={{ width: "100%", padding: "12px 14px", background: "#0d111b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 13, color: "#e5e7eb", outline: "none" }}
                      />
                      {cfg.tokenLabel && (
                        <div style={{ position: "relative" }}>
                          <Lock size={13} color="#4b5563" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                          <input
                            type="password"
                            value={repoToken}
                            onChange={(e) => setRepoToken(e.target.value)}
                            placeholder={cfg.tokenLabel}
                            style={{ width: "100%", padding: "10px 12px 10px 32px", background: "#0d111b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 13, color: "#e5e7eb", outline: "none" }}
                          />
                        </div>
                      )}
                      {isGitSource && (
                        <div style={{ position: "relative" }}>
                          <GitBranch size={13} color="#4b5563" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                          <input
                            type="text"
                            value={repoBranch}
                            onChange={(e) => setRepoBranch(e.target.value)}
                            placeholder="Branch (optional — default: main → master → develop)"
                            style={{ width: "100%", padding: "10px 12px 10px 32px", background: "#0d111b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 13, color: "#e5e7eb", outline: "none" }}
                          />
                        </div>
                      )}
                      <p style={{ fontSize: 11, color: "#4b5563", margin: 0 }}>
                        {cfg.hint}{cfg.tokenHint && <span style={{ color: "#374151" }}> — {cfg.tokenHint}</span>}
                      </p>
                    </div>
                  );
                })()}

                {uploadError && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, marginBottom: 16 }}>
                    <AlertTriangle size={14} color="#ef4444" />
                    <span style={{ fontSize: 13, color: "#ef4444" }}>{uploadError}</span>
                  </div>
                )}

                {/* Notifications panel */}
                <div style={{ background: "#0d111b", border: "1px solid rgba(124,58,237,0.12)", borderRadius: 10, marginBottom: 14 }}>
                  <button onClick={() => setNotifyOpen(!notifyOpen)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", color: "#9ca3af" }}>
                    <Bell size={13} color={notifyOpen ? "#a78bfa" : "#4b5563"} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#e5e7eb", flex: 1, textAlign: "left" }}>
                      Notify when done
                      {(webhookUrl || notifyEmail) && (
                        <span style={{ marginLeft: 8, fontSize: 10, color: "#10b981" }}>✓ configured</span>
                      )}
                    </span>
                    <motion.div animate={{ rotate: notifyOpen ? 90 : 0 }} transition={{ duration: 0.15 }}>
                      <ChevronRight size={12} color="#4b5563" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {notifyOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
                        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Receive a notification as soon as the migration job finishes. Webhook requires a public HTTPS URL.</p>
                          <input
                            value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                            placeholder="Webhook URL (e.g. https://hooks.slack.com/...)"
                            style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#F9FAFB", outline: "none" }}
                          />
                          <input
                            value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)}
                            type="email"
                            placeholder="Email address (requires SMTP_HOST env var on server)"
                            style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#F9FAFB", outline: "none" }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  onClick={startJob}
                  disabled={uploading}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 12, border: "none",
                    background: uploading ? "#374151" : "linear-gradient(135deg, #7c3aed, #e11d48)",
                    color: "#fff", fontSize: 14, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                  {uploading ? (
                    <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw size={16} /></motion.div> Uploading…</>
                  ) : (
                    <><Play size={16} /> Start Migration</>
                  )}
                </motion.button>
              </>
            )}

            {/* Active job progress */}
            {activeJob && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div style={{ background: "#111827", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 12 }}>
                    {activeJob.jobStatus === "running" ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}><RefreshCw size={16} color="#7c3aed" /></motion.div>
                    ) : activeJob.jobStatus === "done" ? <CheckCircle size={16} color="#10b981" />
                    : activeJob.jobStatus === "partial" ? <AlertTriangle size={16} color="#f59e0b" />
                    : <XCircle size={16} color="#ef4444" />}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", margin: 0 }}>{activeJob.sourceName}</p>
                      <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>
                        {activeJob.files.filter((f) => f.status === "done" || f.status === "failed").length}/{activeJob.total} files processed
                      </p>
                    </div>
                    {jobDone && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <a href={`/api/migration/jobs/${activeJob.jobId}/report`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#a78bfa", textDecoration: "none", padding: "6px 12px", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8 }}>
                          View Report
                        </a>
                        <a href={`/api/migration/jobs/${activeJob.jobId}/download`}
                          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", textDecoration: "none", padding: "6px 12px", background: "#7c3aed", borderRadius: 8 }}>
                          <Download size={12} /> Download ZIP
                        </a>
                      </div>
                    )}
                  </div>

                  <div style={{ height: 3, background: "#1f2937" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${activeJob.total > 0 ? (activeJob.files.filter(f => f.status === "done" || f.status === "failed").length / activeJob.total) * 100 : 0}%` }}
                      transition={{ duration: 0.5 }}
                      style={{ height: "100%", background: "linear-gradient(90deg, #7c3aed, #e11d48)" }} />
                  </div>

                  <div>
                    {activeJob.files.map((f) => <FileRow key={f.filename} f={f} />)}
                    {activeJob.jobStatus === "running" && activeJob.files.length === 0 && (
                      <div style={{ padding: "24px", textAlign: "center", color: "#4b5563", fontSize: 13 }}>Initialising pipeline…</div>
                    )}
                  </div>
                </div>

                {jobDone && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                      {[
                        { label: "Succeeded", value: activeJob.succeeded, color: "#10b981" },
                        { label: "Failed", value: activeJob.failed, color: "#ef4444" },
                        { label: "Avg Confidence", value: `${avgConf}%`, color: avgConf >= 80 ? "#10b981" : avgConf >= 60 ? "#f59e0b" : "#ef4444" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ flex: 1, background: "#111827", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px" }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {completedResults && completedResults.map((fr) => <ExpandableResult key={fr.file} fr={fr} />)}

                    {/* Retry failed files */}
                    {activeJob.failed > 0 && (
                      <RetryButton
                        jobId={activeJob.jobId}
                        failedCount={activeJob.failed}
                        onRetryStarted={(newJobId, sourceName, fileCount) => {
                          setCompletedResults(null);
                          setActiveJob({
                            jobId: newJobId,
                            sourceName,
                            total: fileCount,
                            files: [],
                            jobStatus: "running",
                            succeeded: 0,
                            failed: 0,
                          });
                          subscribeToJob(newJobId);
                        }}
                      />
                    )}

                    {/* ── Test Execution Sandbox ───────────────────────── */}
                    <div style={{ marginTop: 24, marginBottom: 8 }}>
                      <TestResultsPanel
                        result={testResult}
                        loading={testLoading}
                        jobId={activeJob.jobId}
                        onValidate={async () => {
                          setTestLoading(true);
                          try {
                            const r = await fetch(`/api/test-execution/jobs/${activeJob.jobId}?mode=validate`);
                            setTestResult(await r.json());
                          } catch (e: any) { setTestResult({ success: false, mode: "validate", error: String(e), tests: [], passed: 0, failed: 0, total: 0 }); }
                          finally { setTestLoading(false); }
                        }}
                        onDryRun={async () => {
                          setTestLoading(true);
                          try {
                            const r = await fetch(`/api/test-execution/jobs/${activeJob.jobId}?mode=dry_run`);
                            setTestResult(await r.json());
                          } catch (e: any) { setTestResult({ success: false, mode: "dry_run", error: String(e), tests: [], passed: 0, failed: 0, total: 0 }); }
                          finally { setTestLoading(false); }
                        }}
                        onExecute={async () => {
                          setTestLoading(true);
                          try {
                            const baseUrl = prompt("Enter target application URL (e.g. https://staging.myapp.com):");
                            const url = baseUrl ? `/api/test-execution/jobs/${activeJob.jobId}?mode=execute&base_url=${encodeURIComponent(baseUrl)}` : `/api/test-execution/jobs/${activeJob.jobId}?mode=execute`;
                            const r = await fetch(url, { method: "POST" });
                            setTestResult(await r.json());
                          } catch (e: any) { setTestResult({ success: false, mode: "execute", error: String(e), tests: [], passed: 0, failed: 0, total: 0 }); }
                          finally { setTestLoading(false); }
                        }}
                      />
                    </div>

                    {completedResults && (
                      <>
                        <PRPanel jobId={activeJob.jobId} results={completedResults} />
                        <VersionHistory jobId={activeJob.jobId} />
                      </>
                    )}

                    <button
                      onClick={() => {
                        sessionStorage.removeItem("migration_active_job");
                        setActiveJob(null); setCompletedResults(null);
                        setSelectedFile(null); setFolderFiles(null);
                        setRepoUrl(""); setRepoToken(""); setRepoBranch("");
                      }}
                      style={{ marginTop: 16, padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
                      Start another migration
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── History tab ── */}
        {tab === "history" && (
          <motion.div key="history" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>{history.length} migration{history.length !== 1 ? "s" : ""}</span>
              <button onClick={loadHistory} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "#6b7280", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <RefreshCw size={11} /> Refresh
              </button>
            </div>

            {historyLoading && <div style={{ textAlign: "center", padding: 40, color: "#4b5563" }}>Loading…</div>}

            {!historyLoading && history.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#4b5563", fontSize: 14 }}>
                No migrations yet.<br />
                <span style={{ fontSize: 12 }}>Start one in the "New Migration" tab.</span>
              </div>
            )}

            {!historyLoading && history.length > 0 && (
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
                {history.map((job) => (
                  <div key={job.id}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ flex: 1 }}><HistoryRow job={job} onOpen={openHistoryDetail} /></div>
                      <button onClick={(e) => deleteJob(job.id, e)}
                        style={{ padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#374151" }} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {openHistoryJob === job.id && historyResults[job.id] && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                          style={{ overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <div style={{ padding: 16 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                              <a href={`/api/migration/jobs/${job.id}/report`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: "#a78bfa", textDecoration: "none", padding: "5px 12px", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 7 }}>
                                View Report
                              </a>
                              <a href={`/api/migration/jobs/${job.id}/download`}
                                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#fff", textDecoration: "none", padding: "5px 12px", background: "#7c3aed", borderRadius: 7 }}>
                                <Download size={11} /> Download ZIP
                              </a>
                            </div>
                            {historyResults[job.id].map((fr) => <ExpandableResult key={fr.file} fr={fr} />)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
