"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Upload, Search, Zap, FileText } from "lucide-react";

const nav = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/upload",    label: "Upload",     icon: Upload          },
  { href: "/search",    label: "Explorer",   icon: Search          },
  { href: "/ai",        label: "AI Actions", icon: Zap             },
  { href: "/documents", label: "Documents",  icon: FileText        },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside
      style={{
        position: "fixed", left: 0, top: 0, height: "100vh", width: "220px",
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", zIndex: 50,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: "white", letterSpacing: "-0.5px",
          }}>QA</div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>QA RAG Platform</p>
            <p style={{ fontSize: 10, color: "var(--text-3)", margin: 0 }}>Enterprise Knowledge</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 9, textDecoration: "none",
              fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? "var(--accent-light)" : "var(--text-2)",
              background: active ? "var(--accent-glow)" : "transparent",
              border: active ? "1px solid rgba(124,58,237,0.2)" : "1px solid transparent",
              transition: "all 0.15s",
            }}>
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Stack */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[["Embeddings", "Mistral 1024-dim"], ["Vector DB", "Pinecone"], ["LLM", "Groq llama-3.3-70b"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{k}</span>
              <span style={{ fontSize: 10, color: "var(--text-2)", fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
