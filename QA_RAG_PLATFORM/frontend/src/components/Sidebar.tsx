"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Upload, Search, Zap, FileText,
  ChevronLeft, ChevronRight, Clock, RefreshCw,
} from "lucide-react";
import { useAppStore } from "@/lib/store";

const MAIN_NAV = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/upload",    label: "Upload",     icon: Upload          },
  { href: "/search",    label: "Explorer",   icon: Search          },
  { href: "/ai",        label: "AI Agents",  icon: Zap             },
  { href: "/migration", label: "Migration",  icon: RefreshCw       },
  { href: "/documents", label: "Documents",  icon: FileText        },
];


function NavItem({ href, label, icon: Icon, collapsed, active }: {
  href: string; label: string; icon: any; collapsed: boolean; active: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }} title={collapsed ? label : undefined}>
      <motion.div
        whileHover={{ x: collapsed ? 0 : 2 }}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: collapsed ? "10px 0" : "9px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderRadius: 10, cursor: "pointer",
          fontSize: 13, fontWeight: active ? 600 : 400,
          color: active ? "#A78BFA" : "#9CA3AF",
          background: active ? "rgba(124,58,237,0.12)" : "transparent",
          border: active ? "1px solid rgba(124,58,237,0.2)" : "1px solid transparent",
          transition: "color 0.15s, background 0.15s, border-color 0.15s",
          position: "relative",
        }}
      >
        {active && (
          <motion.div
            layoutId="sidebar-active"
            style={{
              position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
              width: 3, height: 18, background: "#7C3AED", borderRadius: "0 3px 3px 0",
            }}
          />
        )}
        <Icon size={15} style={{ flexShrink: 0, color: active ? "#7C3AED" : "#6B7280" }} />
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden", whiteSpace: "nowrap" }}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </Link>
  );
}

function LLMStatus({ collapsed }: { collapsed: boolean }) {
  const { data } = useQuery({
    queryKey: ["llm-status"],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/llm/status`);
      return res.json();
    },
    refetchInterval: 30_000,
    retry: false,
  });

  if (!data) return null;
  const { providers, available_count, total_count } = data;
  const allOk = available_count === total_count;

  if (collapsed) {
    return (
      <div style={{ padding: "10px 0", display: "flex", justifyContent: "center" }} title={`${available_count}/${total_count} LLM providers up`}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: allOk ? "#22c55e" : "#f59e0b", boxShadow: allOk ? "0 0 6px #22c55e80" : "0 0 6px #f59e0b80" }} />
      </div>
    );
  }

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
      <div style={{ padding: "10px 14px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.08em" }}>LLM Router</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: allOk ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)", color: allOk ? "#22c55e" : "#f59e0b" }}>
          {available_count}/{total_count}
        </span>
      </div>
      <div style={{ padding: "4px 14px 10px", display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto" }}>
        {providers?.map((p: any) => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: p.available ? "#22c55e" : "#ef4444", boxShadow: p.available ? "0 0 4px #22c55e80" : "none" }} />
            <span style={{ fontSize: 10, color: p.available ? "#9CA3AF" : "#4B5563", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const { sidebarCollapsed, toggleSidebar, setCommandOpen, recentAgents } = useAppStore();
  const W = sidebarCollapsed ? 64 : 240;

  return (
    <>
      {/* Sidebar */}
      <motion.aside
        animate={{ width: W }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "fixed", left: 0, top: 0, height: "100vh", width: W,
          background: "#0D1117",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column", zIndex: 50, overflow: "hidden",
        }}
      >
        {/* Logo + collapse */}
        <div style={{ padding: sidebarCollapsed ? "16px 0" : "16px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between" }}>
          {!sidebarCollapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, #7C3AED, #A78BFA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "white", flexShrink: 0 }}>QA</div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#F9FAFB", margin: 0, whiteSpace: "nowrap" }}>QA RAG Platform</p>
                <p style={{ fontSize: 10, color: "#4B5563", margin: 0, whiteSpace: "nowrap" }}>Enterprise AI</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, #7C3AED, #A78BFA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "white" }}>QA</div>
          )}
          {!sidebarCollapsed && (
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={toggleSidebar} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: "#6B7280", display: "flex" }}>
              <ChevronLeft size={13} />
            </motion.button>
          )}
        </div>

        {/* ⌘K search trigger */}
        {!sidebarCollapsed && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <motion.button
              whileHover={{ borderColor: "rgba(124,58,237,0.4)" }}
              onClick={() => setCommandOpen(true)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "#6B7280",
                fontSize: 12, transition: "border-color 0.15s",
              }}
            >
              <Search size={12} />
              <span style={{ flex: 1, textAlign: "left" }}>Search...</span>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <kbd style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "1px 4px", fontSize: 10, fontFamily: "monospace" }}>⌘K</kbd>
              </div>
            </motion.button>
          </div>
        )}
        {sidebarCollapsed && (
          <div style={{ padding: "8px 0", display: "flex", justifyContent: "center", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <motion.button whileHover={{ scale: 1.1 }} onClick={() => setCommandOpen(true)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: 7, cursor: "pointer", color: "#6B7280", display: "flex" }}>
              <Search size={13} />
            </motion.button>
          </div>
        )}

        {/* Navigation */}
        <div style={{ flex: 1, overflowY: "auto", padding: sidebarCollapsed ? "10px 8px" : "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {!sidebarCollapsed && (
            <p style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 12px 2px" }}>Main</p>
          )}
          {MAIN_NAV.map(({ href, label, icon }) => (
            <NavItem key={href} href={href} label={label} icon={icon} collapsed={sidebarCollapsed} active={path === href} />
          ))}

          {/* Recent section */}
          {!sidebarCollapsed && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", padding: "12px 12px 2px", margin: 0 }}>Recent</p>
              {recentAgents.length === 0 ? (
                <p style={{ fontSize: 11, color: "#374151", padding: "6px 12px", margin: 0, fontStyle: "italic" }}>No agents used yet</p>
              ) : (
                recentAgents.map((item: string) => (
                  <Link key={item} href="/ai" style={{ textDecoration: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#6B7280", transition: "color 0.15s, background 0.15s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#9CA3AF"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#6B7280"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <Clock size={11} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                    </div>
                  </Link>
                ))
              )}
            </>
          )}
        </div>

        {/* Collapse toggle at bottom when collapsed */}
        {sidebarCollapsed && (
          <div style={{ padding: "10px 0", display: "flex", justifyContent: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={toggleSidebar} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: "#6B7280", display: "flex" }}>
              <ChevronRight size={13} />
            </motion.button>
          </div>
        )}

        {/* Stack info / LLM status */}
        <LLMStatus collapsed={sidebarCollapsed} />

        {!sidebarCollapsed && (
          <div style={{ padding: "10px 14px 14px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {[["Embeddings", "Mistral 1024d"], ["Vector DB", "Pinecone"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: "#374151" }}>{k}</span>
                <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </motion.aside>

      {/* Spacer that matches sidebar width */}
      <motion.div animate={{ width: W }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} style={{ flexShrink: 0 }} />
    </>
  );
}
