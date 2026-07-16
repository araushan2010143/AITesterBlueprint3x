"use client";
import { useEffect, useState } from "react";
import { Users, Shield, Plus, Trash2, UserCheck, Crown, Eye, AlertCircle } from "lucide-react";
import { getUser, authHeaders, isAdmin, isLoggedIn } from "@/lib/auth";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface Member { user_id: string; email: string; name: string; role: string; joined_at: string; }
interface TeamData { id: string; name: string; slug: string; description: string; plan: string; owner_id: string; created_at: string; }
interface AuditEntry { id: number; timestamp: string; method: string; path: string; ip: string; status: number; ms: number; }

const ROLE_ICONS: Record<string, any> = { admin: Crown, user: UserCheck, viewer: Eye };
const ROLE_COLORS: Record<string, string> = { admin: "#f59e0b", user: "#10b981", viewer: "#6b7fa8" };

export default function TeamPage() {
  const router = useRouter();
  const currentUser = getUser();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [tab, setTab] = useState<"members" | "audit" | "settings">("members");
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteMsg, setInviteMsg] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [createMsg, setCreateMsg] = useState("");
  const [newTeamName, setNewTeamName] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [tRes, mRes] = await Promise.all([
        fetch(`${API}/api/teams/current`, { headers }),
        fetch(`${API}/api/teams/members`, { headers }),
      ]);
      if (tRes.ok) {
        const t = await tRes.json();
        setTeam(t);
        setTeamName(t.name);
        setTeamDesc(t.description);
      }
      if (mRes.ok) {
        const m = await mRes.json();
        setMembers(m.members || []);
      }
      if (isAdmin()) {
        const aRes = await fetch(`${API}/api/teams/audit-log?limit=50`, { headers });
        if (aRes.ok) { const a = await aRes.json(); setAuditLogs(a.logs || []); }
      }
    } finally {
      setLoading(false);
    }
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    setCreateMsg("");
    const res = await fetch(`${API}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: newTeamName }),
    });
    const data = await res.json();
    if (!res.ok) { setCreateMsg(data.detail || "Failed"); return; }
    // Update stored token with new team context
    if (data.access_token) {
      const { saveSession } = await import("@/lib/auth");
      saveSession(data.access_token, { ...currentUser!, team_id: data.team.id, role: "admin" });
    }
    setCreateMsg("Team created!");
    load();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteMsg("");
    const res = await fetch(`${API}/api/teams/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await res.json();
    setInviteMsg(res.ok ? "Invited successfully!" : (data.detail || "Failed"));
    if (res.ok) { setInviteEmail(""); load(); }
  }

  async function changeRole(userId: string, role: string) {
    await fetch(`${API}/api/teams/members/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member?")) return;
    await fetch(`${API}/api/teams/members/${userId}`, { method: "DELETE", headers: authHeaders() });
    load();
  }

  if (loading) return (
    <div style={{ padding: 48, color: "#4B5563", textAlign: "center" }}>Loading team data...</div>
  );

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#7C3AED,#A78BFA)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Users size={16} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#F9FAFB", margin: 0 }}>
            {team ? team.name : "Team & Workspace"}
          </h1>
          <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>
            {team ? `${members.length} member${members.length !== 1 ? "s" : ""} · ${team.plan} plan` : "No team yet"}
          </p>
        </div>
        {team && (
          <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace", padding: "3px 9px", borderRadius: 5, background: "rgba(124,58,237,0.12)", color: "#A78BFA", border: "1px solid rgba(124,58,237,0.2)", fontWeight: 700, textTransform: "uppercase" }}>
            {team.plan}
          </span>
        )}
      </div>

      {/* No team — create one */}
      {!team && (
        <div style={{ background: "#0f1521", border: "1px solid #1d2640", borderRadius: 12, padding: 28, maxWidth: 440 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <AlertCircle size={16} color="#f59e0b" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#F9FAFB" }}>Create your workspace</span>
          </div>
          <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 20 }}>
            A team lets you share migration jobs, analytics, and company standards with colleagues.
          </p>
          <form onSubmit={createTeam} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
              placeholder="Workspace name (e.g. Acme Corp QA)"
              required style={iStyle}
            />
            <button type="submit" style={btnPrimary}>Create Workspace</button>
            {createMsg && <p style={{ fontSize: 12, color: "#10b981" }}>{createMsg}</p>}
          </form>
        </div>
      )}

      {/* Team exists */}
      {team && (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #1d2640", marginBottom: 24 }}>
            {(["members", "audit", "settings"] as const).map(t => (
              <button
                key={t} onClick={() => setTab(t)}
                style={{
                  padding: "9px 18px", border: "none", background: "transparent",
                  color: tab === t ? "#A78BFA" : "#6B7280",
                  borderBottom: tab === t ? "2px solid #7C3AED" : "2px solid transparent",
                  fontSize: 13, fontWeight: tab === t ? 600 : 400, cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {t === "audit" ? "Audit Log" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Members tab */}
          {tab === "members" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Member list */}
              <div style={{ background: "#0f1521", border: "1px solid #1d2640", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 18px", borderBottom: "1px solid #1d2640", display: "flex", alignItems: "center", gap: 8 }}>
                  <Users size={13} color="#7C3AED" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#F9FAFB" }}>Team Members</span>
                </div>
                {members.map(m => {
                  const RoleIcon = ROLE_ICONS[m.role] || UserCheck;
                  const isOwner = m.user_id === team.owner_id;
                  return (
                    <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: "1px solid #1d2640" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#151c2e", border: "1px solid #1d2640", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#A78BFA", flexShrink: 0 }}>
                        {(m.name || m.email)[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "#F9FAFB", fontWeight: 500 }}>{m.name || m.email}</div>
                        <div style={{ fontSize: 11, color: "#4B5563" }}>{m.email}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <RoleIcon size={12} color={ROLE_COLORS[m.role]} />
                        {isAdmin() && !isOwner && m.user_id !== currentUser?.id ? (
                          <select
                            value={m.role}
                            onChange={e => changeRole(m.user_id, e.target.value)}
                            style={{ background: "#151c2e", border: "1px solid #1d2640", color: ROLE_COLORS[m.role], borderRadius: 5, padding: "2px 6px", fontSize: 11, cursor: "pointer" }}
                          >
                            <option value="admin">Admin</option>
                            <option value="user">User</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: 11, color: ROLE_COLORS[m.role], fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase" }}>
                            {isOwner ? "Owner" : m.role}
                          </span>
                        )}
                        {isAdmin() && !isOwner && m.user_id !== currentUser?.id && (
                          <button onClick={() => removeMember(m.user_id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#f43f5e", padding: "2px 4px", display: "flex" }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Invite form (admins only) */}
              {isAdmin() && (
                <div style={{ background: "#0f1521", border: "1px solid #1d2640", borderRadius: 12, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <Plus size={13} color="#7C3AED" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#F9FAFB" }}>Invite Member</span>
                  </div>
                  <form onSubmit={invite} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input
                      value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      type="email" placeholder="colleague@company.com" required
                      style={{ ...iStyle, flex: "1 1 200px" }}
                    />
                    <select
                      value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                      style={{ ...iStyle, flex: "0 0 auto", width: 110 }}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button type="submit" style={{ ...btnPrimary, flex: "0 0 auto", padding: "9px 18px" }}>Invite</button>
                  </form>
                  {inviteMsg && <p style={{ fontSize: 12, color: inviteMsg.includes("!") ? "#10b981" : "#f43f5e", marginTop: 8 }}>{inviteMsg}</p>}
                </div>
              )}
            </div>
          )}

          {/* Audit Log tab */}
          {tab === "audit" && (
            <div style={{ background: "#0f1521", border: "1px solid #1d2640", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
                  <thead>
                    <tr>
                      {["Timestamp", "Method", "Path", "IP", "Status", "ms"].map(h => (
                        <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #1d2640", background: "#0d1117", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#4B5563" }}>No audit entries yet</td></tr>
                    ) : auditLogs.map(l => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #1d2640" }}>
                        <td style={{ padding: "8px 14px", color: "#6B7280", whiteSpace: "nowrap" }}>{new Date(l.timestamp).toLocaleString()}</td>
                        <td style={{ padding: "8px 14px", color: l.method === "GET" ? "#3b82f6" : l.method === "POST" ? "#10b981" : "#f59e0b", fontWeight: 700 }}>{l.method}</td>
                        <td style={{ padding: "8px 14px", color: "#9CA3AF", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.path}</td>
                        <td style={{ padding: "8px 14px", color: "#6B7280" }}>{l.ip || "—"}</td>
                        <td style={{ padding: "8px 14px", color: l.status < 300 ? "#10b981" : l.status < 400 ? "#f59e0b" : "#f43f5e" }}>{l.status}</td>
                        <td style={{ padding: "8px 14px", color: "#4B5563" }}>{l.ms.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Settings tab */}
          {tab === "settings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}>
              <div style={{ background: "#0f1521", border: "1px solid #1d2640", borderRadius: 12, padding: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Workspace Info</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    ["Workspace ID", team.id],
                    ["Slug", team.slug],
                    ["Plan", team.plan],
                    ["Created", new Date(team.created_at).toLocaleDateString()],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#6B7280" }}>{k}</span>
                      <span style={{ fontFamily: "monospace", color: "#F9FAFB", fontSize: 11 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <Shield size={14} color="#f43f5e" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#F9FAFB" }}>Danger Zone</span>
                </div>
                <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>Deleting a workspace removes all jobs, standards, and member access permanently.</p>
                <button
                  onClick={() => alert("Contact support to delete a workspace.")}
                  style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid rgba(244,63,94,0.4)", background: "transparent", color: "#f43f5e", fontSize: 12, cursor: "pointer" }}
                >
                  Delete Workspace
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const iStyle: React.CSSProperties = {
  padding: "9px 12px", borderRadius: 8, background: "#151c2e",
  border: "1px solid #1d2640", color: "#F9FAFB", fontSize: 13, outline: "none",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 0", borderRadius: 8, border: "none",
  background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
  color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
