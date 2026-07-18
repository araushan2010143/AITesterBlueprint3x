/**
 * Dashboard — collection stats, ingestion status, quick navigation.
 * The Knowledge Platform home, not a chat landing page.
 */
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/chat",     label: "QA Assistant",     desc: "Ask anything about your QA knowledge base",      color: "#3B82F6" },
  { href: "/search",   label: "Semantic Search",   desc: "Hybrid retrieval with metadata filters",          color: "#8B5CF6" },
  { href: "/rca",      label: "Root Cause Analysis", desc: "Diagnose failures from logs, commits & history", color: "#22D3EE" },
  { href: "/agents",   label: "AI Agents",         desc: "RTM Builder, Coverage Analyzer, Flaky Test Agent", color: "#10B981" },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <p className="text-xs font-bold tracking-widest uppercase text-[#3B82F6] mb-2">
            QA Intelligence Platform v1.0
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight mb-3">
            Enterprise QA{" "}
            <span className="bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] bg-clip-text text-transparent">
              Knowledge Platform
            </span>
          </h1>
          <p className="text-[#64748B] text-base max-w-2xl">
            Chat is one interface. The knowledge graph, retrieval engine, indexing pipeline,
            and reasoning layer power every capability below.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-5 mb-12">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block p-6 rounded-2xl bg-[#0D1426] border border-white/[0.07] hover:border-white/20 transition-colors group"
            >
              <div
                className="w-2 h-2 rounded-full mb-4"
                style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }}
              />
              <h2 className="text-lg font-bold mb-1 group-hover:text-white transition-colors">
                {item.label}
              </h2>
              <p className="text-sm text-[#64748B]">{item.desc}</p>
            </Link>
          ))}
        </div>

        <section>
          <h2 className="text-sm font-bold tracking-widest uppercase text-[#64748B] mb-4">
            Knowledge Collections
          </h2>
          <CollectionStatus />
        </section>
      </div>
    </main>
  );
}

function CollectionStatus() {
  const collections = [
    "selenium", "playwright", "jira", "testcases",
    "prd", "logs", "meeting_notes", "company_docs", "jenkins",
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {collections.map((col) => (
        <span
          key={col}
          className="px-3 py-1 rounded-full text-xs font-semibold bg-[#0D1426] border border-white/[0.07] text-[#94A3B8]"
        >
          {col}
        </span>
      ))}
    </div>
  );
}
