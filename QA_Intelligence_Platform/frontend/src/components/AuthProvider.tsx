"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getUser, getToken, isAuthenticated, saveAuth, clearAuth, type AuthUser } from "@/lib/auth";
import { api } from "@/lib/api";

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, logout: () => {} });

export function useAuth() { return useContext(Ctx); }

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready,   setReady]   = useState(false);   // after first client render

  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated()) { setLoading(false); return; }
    const cached = getUser();
    if (cached) { setUser(cached); setLoading(false); return; }
    // Verify token against backend
    api.me()
      .then(u => { setUser({ id: u.id, email: u.email, name: u.name }); })
      .catch(() => { clearAuth(); })
      .finally(() => setLoading(false));
  }, [ready]);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  // SSR: render nothing meaningful until client hydrates
  if (!ready) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F3EE" }}>
        <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginGate onLogin={(u) => setUser(u)} />;
  }

  return <Ctx.Provider value={{ user, loading, logout }}>{children}</Ctx.Provider>;
}


// ── Login / Register gate ──────────────────────────────────────────────────────

function LoginGate({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const [tab,      setTab]      = useState<"login" | "register">("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [error,    setError]    = useState("");
  const [busy,     setBusy]     = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (tab === "register") {
        const u = await api.register(email, password, name);
        // auto-login after register
        const t = await api.login(email, password);
        saveAuth(t.access_token, { id: u.id, email: u.email, name: u.name });
        onLogin({ id: u.id, email: u.email, name: u.name });
      } else {
        const t = await api.login(email, password);
        // Fetch user info
        const u = await (async () => {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth/me`,
            { headers: { Authorization: `Bearer ${t.access_token}` } },
          );
          return res.json();
        })();
        saveAuth(t.access_token, { id: u.id, email: u.email, name: u.name });
        onLogin({ id: u.id, email: u.email, name: u.name });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: "#F5F3EE" }}>
      <div className="w-full max-w-sm">

        {/* Wordmark */}
        <div className="text-center mb-8">
          <div className="text-2xl mb-2 select-none" style={{ color: "#C2391B" }}>✳</div>
          <h1 className="text-2xl font-bold text-stone-900"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.02em" }}>
            QA Buddy
          </h1>
          <p className="text-[12px] text-stone-400 mt-1" style={{ fontFamily: "Courier New, monospace" }}>
            enterprise qa knowledge platform
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden"
             style={{ borderColor: "#D6D1C8" }}>

          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: "#D6D1C8" }}>
            {(["login", "register"] as const).map(t => (
              <button key={t}
                onClick={() => { setTab(t); setError(""); }}
                className="flex-1 py-3 text-[12px] font-medium transition-colors"
                style={{
                  fontFamily:  "Courier New, monospace",
                  color:       tab === t ? "#1C1917" : "#A8A29E",
                  background:  tab === t ? "#FAFAF8" : "white",
                  borderBottom: tab === t ? "2px solid #C2391B" : "2px solid transparent",
                }}>
                {t}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={submit} className="px-6 py-6 space-y-4">
            {tab === "register" && (
              <Field label="Name" type="text" value={name}
                     placeholder="Your name" onChange={setName} />
            )}
            <Field label="Email" type="email" value={email}
                   placeholder="you@company.com" onChange={setEmail} />
            <Field label="Password" type="password" value={password}
                   placeholder={tab === "register" ? "Min 8 characters" : "••••••••"}
                   onChange={setPassword} />

            {error && (
              <p className="text-[12px] px-3 py-2 rounded-lg"
                 style={{ background: "#FEF3F0", color: "#C2391B", fontFamily: "Courier New, monospace" }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={busy}
                    className="w-full py-2.5 rounded-xl text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "#1C1917" }}>
              {busy
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {tab === "register" ? "Creating account…" : "Signing in…"}
                  </span>
                : tab === "register" ? "Create account" : "Sign in"
              }
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-stone-400 mt-6"
           style={{ fontFamily: "Courier New, monospace" }}>
          {tab === "login"
            ? <>No account? <button onClick={() => setTab("register")} className="underline hover:text-stone-600 transition-colors">Register</button></>
            : <>Already have an account? <button onClick={() => setTab("login")} className="underline hover:text-stone-600 transition-colors">Sign in</button></>
          }
        </p>
      </div>
    </div>
  );
}

function Field({
  label, type, value, placeholder, onChange,
}: {
  label: string; type: string; value: string;
  placeholder: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] tracking-widest uppercase text-stone-400"
             style={{ fontFamily: "Courier New, monospace" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="bg-stone-50 border rounded-lg px-3 py-2 text-[13px] text-stone-800 placeholder-stone-300 focus:outline-none focus:border-stone-400 transition-colors"
        style={{ borderColor: "#D6D1C8" }}
      />
    </div>
  );
}
