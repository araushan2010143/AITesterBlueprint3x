"use client";
import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Upload, Search, Zap, FileText,
  Flame, GitBranch, TestTube, Copy, Target,
  AlertCircle, FileCheck, Code, Database, RefreshCw,
} from "lucide-react";
import { useAppStore } from "@/lib/store";

const NAV_ITEMS = [
  { label: "Dashboard",  href: "/",          icon: LayoutDashboard, group: "Pages" },
  { label: "Upload",     href: "/upload",    icon: Upload,          group: "Pages" },
  { label: "Explorer",   href: "/search",    icon: Search,          group: "Pages" },
  { label: "AI Agents",  href: "/ai",        icon: Zap,             group: "Pages" },
  { label: "Documents",  href: "/documents", icon: FileText,        group: "Pages" },
];

const AGENT_ITEMS = [
  { label: "Generate Test Cases",       href: "/ai", icon: TestTube,    group: "AI Agents" },
  { label: "Find Duplicates",           href: "/ai", icon: Copy,        group: "AI Agents" },
  { label: "Coverage Analysis",         href: "/ai", icon: Target,      group: "AI Agents" },
  { label: "Explain Failure",           href: "/ai", icon: AlertCircle, group: "AI Agents" },
  { label: "Release Summary",           href: "/ai", icon: FileCheck,   group: "AI Agents" },
  { label: "Generate Script",           href: "/ai", icon: Code,        group: "AI Agents" },
  { label: "Test Data Generator",       href: "/ai", icon: Database,    group: "AI Agents" },
  { label: "Flaky Test Analyzer",       href: "/ai", icon: Flame,       group: "AI Agents" },
  { label: "Automation Pipeline",       href: "/ai", icon: GitBranch,   group: "AI Agents" },
  { label: "Legacy Migration Engine",   href: "/ai", icon: RefreshCw,   group: "AI Agents" },
];

export default function CommandPalette() {
  const { commandOpen, setCommandOpen } = useAppStore();
  const router = useRouter();

  const close = useCallback(() => setCommandOpen(false), [setCommandOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandOpen, setCommandOpen, close]);

  const go = (href: string) => {
    router.push(href);
    close();
  };

  const allItems = [...NAV_ITEMS, ...AGENT_ITEMS];

  return (
    <AnimatePresence>
      {commandOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed", top: "20vh", left: "50%", transform: "translateX(-50%)",
              width: "min(560px, 90vw)", zIndex: 201,
              background: "#111827",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 16,
              boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.1)",
              overflow: "hidden",
            }}
          >
            <Command label="Command Menu">
              {/* Search input */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <Search size={15} color="#6B7280" />
                <Command.Input
                  placeholder="Search pages, agents, actions…"
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    fontSize: 14, color: "#F9FAFB", caretColor: "#7C3AED",
                  }}
                />
                <button onClick={close} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "2px 6px", cursor: "pointer", color: "#6B7280", fontSize: 11 }}>ESC</button>
              </div>

              <Command.List style={{ maxHeight: 360, overflowY: "auto", padding: "8px 8px" }}>
                <Command.Empty style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "#6B7280" }}>
                  No results found.
                </Command.Empty>

                {["Pages", "AI Agents"].map((group) => {
                  const items = allItems.filter((i) => i.group === group);
                  return (
                    <Command.Group key={group} heading={group}
                      style={{ "--cmdk-group-heading-color": "#6B7280" } as any}
                    >
                      {items.map((item) => (
                        <Command.Item
                          key={item.label}
                          onSelect={() => go(item.href)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                            fontSize: 13, color: "#E5E7EB",
                            transition: "background 0.1s",
                          }}
                          className="cmd-item"
                        >
                          <item.icon size={14} color="#7C3AED" />
                          {item.label}
                          {item.group === "Pages" && (
                            <span style={{ marginLeft: "auto", fontSize: 11, color: "#4B5563" }}>↵</span>
                          )}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}
              </Command.List>

              {/* Footer */}
              <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 16, alignItems: "center" }}>
                {[["↑↓", "Navigate"], ["↵", "Select"], ["ESC", "Close"]].map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6B7280" }}>
                    <kbd style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>{key}</kbd>
                    {label}
                  </div>
                ))}
              </div>
            </Command>
          </motion.div>

          <style>{`
            [cmdk-group-heading] {
              padding: 6px 12px 4px;
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: #6B7280;
            }
            [cmdk-item][aria-selected="true"] {
              background: rgba(124,58,237,0.15) !important;
              color: #A78BFA !important;
            }
            [cmdk-item]:hover {
              background: rgba(255,255,255,0.04);
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
