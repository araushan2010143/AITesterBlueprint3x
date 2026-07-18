"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Command {
  id: string;
  label: string;
  subtitle: string;
  category: "Navigate" | "Action";
  path?: string;
  action?: () => Promise<void>;
  keys?: string;
}

const NAV_COMMANDS: Command[] = [
  { id: "nav-home",      label: "Dashboard",           subtitle: "Stats · collections · auto-ingest status",      category: "Navigate", path: "/",          keys: "⌘H" },
  { id: "nav-chat",      label: "Chat",                subtitle: "Ask anything · auto-routes to the right agent", category: "Navigate", path: "/chat",      keys: "⌘1" },
  { id: "nav-search",    label: "Search",              subtitle: "Hybrid vector + BM25 across all 9 collections", category: "Navigate", path: "/search",    keys: "⌘2" },
  { id: "nav-rca",       label: "Root Cause Analysis", subtitle: "Paste a stack trace · get a cited diagnosis",   category: "Navigate", path: "/rca",       keys: "⌘3" },
  { id: "nav-agents",    label: "Agents",              subtitle: "RTM Builder · Coverage · Flaky Test · RCA",     category: "Navigate", path: "/agents",    keys: "⌘4" },
  { id: "nav-knowledge", label: "Knowledge Hub",       subtitle: "9 collections · health status · re-index",      category: "Navigate", path: "/knowledge", keys: "⌘5" },
  { id: "nav-ingest",    label: "Ingest",              subtitle: "Drag-and-drop files · SHA256 dedup · index",    category: "Navigate", path: "/ingest",    keys: "⌘6" },
];

const NAV_ICONS: Record<string, string> = {
  "nav-home":      "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  "nav-chat":      "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  "nav-search":    "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  "nav-rca":       "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  "nav-agents":    "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  "nav-knowledge": "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4",
  "nav-ingest":    "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
};

const ACTION_COMMANDS: Command[] = [
  {
    id: "action-ingest",
    label: "Trigger Auto-Ingest",
    subtitle: "Scan data/ folder and index new or modified files now",
    category: "Action",
    action: async () => {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/admin/ingest/trigger`,
        { method: "POST" }
      );
    },
    keys: "⌘⇧I",
  },
];

const ALL_COMMANDS = [...NAV_COMMANDS, ...ACTION_COMMANDS];

export default function CommandPalette() {
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState("");
  const [active,  setActive]  = useState(0);
  const [toast,   setToast]   = useState<string | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);
  const router    = useRouter();

  const filtered = query.trim()
    ? ALL_COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : ALL_COMMANDS;

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setActive(0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const execute = useCallback(async (cmd: Command) => {
    closePalette();
    if (cmd.path) {
      router.push(cmd.path);
    } else if (cmd.action) {
      await cmd.action();
      setToast(`${cmd.label} triggered`);
      setTimeout(() => setToast(null), 2500);
    }
  }, [closePalette, router]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open ? closePalette() : openPalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette, closePalette]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  // Keep active index in range when filter changes
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Arrow key + Enter navigation inside palette
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); closePalette(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) execute(filtered[active]); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, active, filtered, execute, closePalette]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Group by category
  const navItems    = filtered.filter(c => c.category === "Navigate");
  const actionItems = filtered.filter(c => c.category === "Action");

  if (!open) {
    return toast ? (
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
        <div className="px-4 py-2.5 rounded-xl bg-stone-900 text-stone-100 text-[13px] shadow-xl"
             style={{ fontFamily: "Courier New, monospace" }}>
          {toast}
        </div>
      </div>
    ) : null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150] bg-stone-900/40 backdrop-blur-sm"
        onClick={closePalette}
      />

      {/* Palette card */}
      <div className="fixed inset-0 z-[160] flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
        <div
          className="w-full max-w-[560px] bg-white rounded-2xl shadow-2xl border overflow-hidden pointer-events-auto"
          style={{ borderColor: "#D6D1C8" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: "#E0DCD4" }}>
            <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Navigate to… or search commands"
              className="flex-1 bg-transparent text-[15px] text-stone-800 placeholder-stone-300 focus:outline-none"
            />
            <kbd className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] text-stone-400"
                 style={{ borderColor: "#D6D1C8", fontFamily: "Courier New, monospace" }}>
              ESC
            </kbd>
          </div>

          {/* Command list */}
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 360 }}>
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-stone-400">
                No commands match &ldquo;{query}&rdquo;
              </div>
            ) : (
              <>
                {navItems.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-[10px] tracking-widest uppercase text-stone-400"
                            style={{ fontFamily: "Courier New, monospace" }}>
                        Navigate
                      </span>
                    </div>
                    {navItems.map(cmd => {
                      const idx = filtered.indexOf(cmd);
                      return (
                        <button
                          key={cmd.id}
                          data-idx={idx}
                          onClick={() => execute(cmd)}
                          onMouseEnter={() => setActive(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            active === idx ? "bg-stone-800" : "hover:bg-stone-50"
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            active === idx ? "bg-stone-700" : "bg-stone-100"
                          }`}>
                            <svg className={`w-3.5 h-3.5 ${active === idx ? "text-stone-200" : "text-stone-500"}`}
                                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={NAV_ICONS[cmd.id] ?? ""} />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium leading-tight ${active === idx ? "text-white" : "text-stone-800"}`}>
                              {cmd.label}
                            </p>
                            <p className={`text-[11px] leading-tight mt-0.5 truncate ${active === idx ? "text-stone-400" : "text-stone-400"}`}>
                              {cmd.subtitle}
                            </p>
                          </div>
                          {cmd.keys && (
                            <kbd className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${
                              active === idx
                                ? "border-stone-600 text-stone-500 bg-stone-700"
                                : "border-stone-200 text-stone-400"
                            }`} style={{ fontFamily: "Courier New, monospace" }}>
                              {cmd.keys}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {actionItems.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-[10px] tracking-widest uppercase text-stone-400"
                            style={{ fontFamily: "Courier New, monospace" }}>
                        Actions
                      </span>
                    </div>
                    {actionItems.map(cmd => {
                      const idx = filtered.indexOf(cmd);
                      return (
                        <button
                          key={cmd.id}
                          data-idx={idx}
                          onClick={() => execute(cmd)}
                          onMouseEnter={() => setActive(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            active === idx ? "bg-stone-800" : "hover:bg-stone-50"
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            active === idx ? "bg-stone-700" : "bg-amber-50"
                          }`}>
                            <svg className={`w-3.5 h-3.5 ${active === idx ? "text-stone-200" : "text-amber-600"}`}
                                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium leading-tight ${active === idx ? "text-white" : "text-stone-800"}`}>
                              {cmd.label}
                            </p>
                            <p className={`text-[11px] leading-tight mt-0.5 truncate ${active === idx ? "text-stone-400" : "text-stone-400"}`}>
                              {cmd.subtitle}
                            </p>
                          </div>
                          {cmd.keys && (
                            <kbd className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${
                              active === idx
                                ? "border-stone-600 text-stone-500 bg-stone-700"
                                : "border-stone-200 text-stone-400"
                            }`} style={{ fontFamily: "Courier New, monospace" }}>
                              {cmd.keys}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t text-[10px] text-stone-400"
               style={{ borderColor: "#E0DCD4", fontFamily: "Courier New, monospace", background: "#FAFAF8" }}>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-stone-200 text-[9px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-stone-200 text-[9px]">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-stone-200 text-[9px]">ESC</kbd>
              close
            </span>
            <span className="ml-auto flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-stone-200 text-[9px]">⌘K</kbd>
              toggle
            </span>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
          <div className="px-4 py-2.5 rounded-xl bg-stone-900 text-stone-100 text-[13px] shadow-xl"
               style={{ fontFamily: "Courier New, monospace" }}>
            {toast}
          </div>
        </div>
      )}
    </>
  );
}
