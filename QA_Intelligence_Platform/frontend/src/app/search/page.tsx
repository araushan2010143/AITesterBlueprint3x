"use client";
export default function SearchPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-10">
      <h1 className="text-2xl font-bold mb-2">Semantic Search</h1>
      <p className="text-[#64748B] text-sm">
        Hybrid vector + BM25 · Metadata filters (sprint, severity, module, framework)
      </p>
    </div>
  );
}
