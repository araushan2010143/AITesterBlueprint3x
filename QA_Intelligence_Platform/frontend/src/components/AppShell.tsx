"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const NAV_ITEMS = [
  { href: "/",          label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/chat",      label: "Chat",      icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
  { href: "/search",    label: "Search",    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
  { href: "/rca",       label: "RCA",       icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { href: "/agents",    label: "Agents",    icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { href: "/knowledge", label: "Knowledge", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" },
  { href: "/ingest",    label: "Ingest",    icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" },
];

interface Props {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function AppShell({ children, sidebar }: Props) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  function openPalette() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  }

  return (
    <div className="flex h-screen overflow-hidden"
         style={{ background: "#F5F3EE", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="flex flex-col flex-shrink-0 border-r"
             style={{ width: 248, background: "#EDEAE3", borderColor: "#D6D1C8" }}>

        {/* Brand */}
        <div className="px-5 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <Link href="/">
              <h1 className="font-bold text-stone-900 text-lg leading-tight cursor-pointer"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.01em" }}>
                QA Buddy
              </h1>
            </Link>
            <span className="flex items-center gap-1.5 text-[10px] text-stone-500"
                  style={{ fontFamily: "Courier New, monospace" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              online
            </span>
          </div>
          <p className="text-[10px] tracking-widest uppercase text-stone-400 mt-0.5"
             style={{ fontFamily: "Courier New, monospace" }}>
            QA Knowledge System
          </p>
        </div>

        <div className="border-t flex-shrink-0" style={{ borderColor: "#D6D1C8" }} />

        {/* Page-specific sidebar content */}
        {sidebar && (
          <div className="flex-1 overflow-y-auto min-h-0">
            {sidebar}
          </div>
        )}

        {/* User + logout */}
        {user && (
          <div className="px-5 py-3 border-t flex-shrink-0 flex items-center gap-2"
               style={{ borderColor: "#D6D1C8" }}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-stone-700 truncate">{user.name}</p>
              <p className="text-[10px] text-stone-400 truncate" style={{ fontFamily: "Courier New, monospace" }}>
                {user.email}
              </p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="flex-shrink-0 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}

        {/* Nav footer */}
        <div className="border-t flex-shrink-0" style={{ borderColor: "#D6D1C8" }} />
        <nav className="px-4 py-3 flex-shrink-0">
          {/* Cmd+K shortcut hint */}
          <button
            onClick={openPalette}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-stone-400 hover:text-stone-600 hover:bg-stone-200 transition-colors mb-1"
            style={{ fontFamily: "Courier New, monospace" }}>
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-stone-300 text-[9px] text-stone-400 bg-white">
              ⌘K
            </kbd>
            command palette
          </button>

          <div className="space-y-0.5 mt-1">
            {NAV_ITEMS.map(({ href, label, icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 text-[12px] rounded-lg px-2 py-1.5 transition-colors ${
                    active
                      ? "bg-stone-800 text-white"
                      : "text-stone-500 hover:text-stone-800 hover:bg-stone-200"
                  }`}
                  style={{ fontFamily: "Courier New, monospace" }}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d={icon} />
                  </svg>
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {children}
      </div>
    </div>
  );
}
