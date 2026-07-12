"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Upload, Search, Zap, FileText, Settings } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/search", label: "Explorer", icon: Search },
  { href: "/ai", label: "AI Actions", icon: Zap },
  { href: "/documents", label: "Documents", icon: FileText },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r border-[var(--border)] bg-[var(--surface-1)] flex flex-col z-10">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold">QA</div>
          <div>
            <p className="text-xs font-bold text-white">QA RAG Platform</p>
            <p className="text-[10px] text-[var(--text-muted)]">Enterprise Knowledge</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                active
                  ? "bg-indigo-600/20 text-indigo-400 font-semibold"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-white"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)]">
        <p className="text-[10px] text-[var(--text-muted)] text-center">
          Mistral · Pinecone · Groq
        </p>
      </div>
    </aside>
  );
}
