"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, AuthUser } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<{ google: boolean } | null>(null);

  // Check which OAuth providers are available
  useState(() => {
    fetch(`${API}/api/auth/oauth/status`)
      .then(r => r.json())
      .then(d => setOauthStatus(d))
      .catch(() => {});
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login"
        ? { email, password }
        : { email, password, name };

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");

      saveSession(data.access_token, data.user as AuthUser);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#090d16",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, background: "#0f1521",
        border: "1px solid #1d2640", borderRadius: 16, padding: "36px 32px",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg,#7C3AED,#A78BFA)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "white",
          }}>QA</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F9FAFB" }}>QA RAG Platform</div>
            <div style={{ fontSize: 11, color: "#4B5563" }}>Enterprise Migration Studio</div>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{
          display: "flex", background: "#151c2e", borderRadius: 8, padding: 3, marginBottom: 24,
        }}>
          {(["login", "register"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 6, border: "none",
                background: mode === m ? "#1d2640" : "transparent",
                color: mode === m ? "#F9FAFB" : "#6B7280",
                fontSize: 13, fontWeight: mode === m ? 600 : 400,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {m === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && (
            <div>
              <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 5 }}>Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                style={inputStyle}
              />
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 5 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com" required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 5 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Min 8 characters" : "••••••••"} required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)",
              borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#f43f5e",
            }}>{error}</div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: 4, padding: "11px 0", borderRadius: 9, border: "none",
              background: loading ? "#1d2640" : "linear-gradient(135deg,#7C3AED,#6D28D9)",
              color: loading ? "#4B5563" : "white",
              fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer",
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* ── SSO ── */}
        {oauthStatus?.google && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "#1d2640" }} />
              <span style={{ fontSize: 11, color: "#4B5563" }}>or continue with</span>
              <div style={{ flex: 1, height: 1, background: "#1d2640" }} />
            </div>
            <button
              onClick={async () => {
                const res = await fetch(`${API}/api/auth/oauth/google`);
                const d = await res.json();
                if (d.url) window.location.href = d.url;
              }}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 9, border: "1px solid #1d2640",
                background: "#151c2e", color: "#F9FAFB", fontSize: 13, fontWeight: 500,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        )}

        <p style={{ marginTop: 20, fontSize: 11, color: "#4B5563", textAlign: "center" }}>
          {mode === "login" ? (
            <>No account? <span style={{ color: "#7C3AED", cursor: "pointer" }} onClick={() => setMode("register")}>Register</span></>
          ) : (
            <>Already have an account? <span style={{ color: "#7C3AED", cursor: "pointer" }} onClick={() => setMode("login")}>Sign in</span></>
          )}
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: "#151c2e", border: "1px solid #1d2640",
  color: "#F9FAFB", fontSize: 13, outline: "none",
  boxSizing: "border-box",
};
