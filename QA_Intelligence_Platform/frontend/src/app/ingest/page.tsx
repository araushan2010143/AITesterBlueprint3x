"use client";
import { useState, useRef, useCallback } from "react";
import { api, type IngestResponse } from "@/lib/api";
import { KNOWLEDGE_BASE } from "@/lib/collections";
import { AppShell } from "@/components/AppShell";

// ── Source types supported by backend ────────────────────────────────────────
const SOURCE_TYPES = [
  { value: "code",          label: "Code",          ext: ".java .ts .py .js .go .cs" },
  { value: "pdf",           label: "PDF",           ext: ".pdf" },
  { value: "pptx",          label: "Presentation",  ext: ".pptx .ppt" },
  { value: "markdown",      label: "Markdown",      ext: ".md .mdx" },
  { value: "text",          label: "Text / XML",    ext: ".txt .xml .yaml .json .docx" },
  { value: "csv",           label: "CSV",           ext: ".csv" },
  { value: "excel",         label: "Excel",         ext: ".xlsx .xls" },
  { value: "logs",          label: "Logs",          ext: ".log .out" },
  { value: "meeting_notes", label: "Meeting Notes", ext: ".txt .md .docx" },
];

// Auto-detect source type from file extension
function detectSourceType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["java", "ts", "tsx", "py", "js", "jsx", "go", "cs", "rb", "kt"].includes(ext)) return "code";
  if (ext === "pdf")              return "pdf";
  if (["pptx", "ppt"].includes(ext)) return "pptx";
  if (["md", "mdx"].includes(ext)) return "markdown";
  if (["log", "out"].includes(ext)) return "logs";
  if (ext === "csv")              return "csv";
  if (["xlsx", "xls"].includes(ext)) return "excel";
  return "text";
}

// Mirror of the backend resolve_collection() rules — frontend uses this for UX hints only.
// Backend is always authoritative; this just pre-selects the right collection for the user.
function suggestCollection(filename: string): { collection: string; strong: boolean } {
  const f   = filename.toLowerCase();
  const ext = f.split(".").pop() ?? "";

  // Strong keyword signals
  if (/test.?case|testcase|tc[-_]\d/.test(f))       return { collection: "testcases",     strong: true };
  if (/\bselenium\b/.test(f))                        return { collection: "selenium",      strong: true };
  if (/\bplaywright\b/.test(f))                      return { collection: "playwright",    strong: true };
  if (/\bjira\b|ticket[-_]|kan[-_]/.test(f))         return { collection: "jira",          strong: true };
  if (/meeting|standup|sprint.?plan|retro/.test(f))  return { collection: "meeting_notes", strong: true };
  if (/prd|brd|srs|frd|requirement/.test(f))         return { collection: "prd",           strong: true };
  if (/jenkins|build.?log|console.?log/.test(f))     return { collection: "logs",          strong: true };
  if (/company|policy|onboard|handbook/.test(f))     return { collection: "company_docs",  strong: true };

  // Extension rules — structural, unambiguous
  if (["pptx", "ppt", "key"].includes(ext))          return { collection: "company_docs",  strong: true };
  if (["xlsx", "xls"].includes(ext))                 return { collection: "company_docs",  strong: true };
  if (["log", "out"].includes(ext))                  return { collection: "logs",          strong: true };

  // Document extensions → soft default (user may want to override)
  if (["pdf", "docx", "doc", "md", "mdx", "txt"].includes(ext))
    return { collection: "company_docs", strong: false };

  return { collection: "company_docs", strong: false };
}

// ── Result log item ────────────────────────────────────────────────────────────
interface LogItem {
  id: string;
  filename: string;
  collection: string;
  indexed: number;
  skipped: number;
  status: "success" | "error";
  error?: string;
}

// ── Side-by-side upload form + log ────────────────────────────────────────────
export default function IngestPage() {
  const [files,           setFiles]           = useState<File[]>([]);
  const [collection,      setCollection]      = useState("company_docs");
  const [autoCollection,  setAutoCollection]  = useState(false);
  const [autoCollectionStrong, setAutoCollectionStrong] = useState(false);
  const [sourceType,      setSourceType]      = useState("code");
  const [autoDetect,      setAutoDetect]      = useState(true);
  const [repo,        setRepo]        = useState("");
  const [framework,   setFramework]   = useState("");
  const [module,      setModule]      = useState("");
  const [sprint,      setSprint]      = useState("");
  const [loading,     setLoading]     = useState(false);
  const [log,         setLog]         = useState<LogItem[]>([]);
  const [dragging,    setDragging]    = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !names.has(f.name))];
    });
    if (arr.length === 1) {
      const { collection: suggested, strong } = suggestCollection(arr[0].name);
      if (strong) {
        // Strong signal (keyword or structural extension like pptx) — always override
        setCollection(suggested);
        setAutoCollection(true);
        setAutoCollectionStrong(true);
      } else {
        // Soft default — apply unless user already made a deliberate manual pick
        // Use functional updater to read current autoCollection without stale closure
        setAutoCollection(prev => {
          if (!prev) {
            setCollection(suggested);
            setAutoCollectionStrong(false);
            return true;
          }
          return prev;
        });
      }
    } else {
      // Multiple files — clear auto hint, keep whatever collection is selected
      setAutoCollection(false);
      setAutoCollectionStrong(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name));

  async function runIngest() {
    if (!files.length || loading) return;
    setLoading(true);

    for (const file of files) {
      const st = autoDetect ? detectSourceType(file.name) : sourceType;
      try {
        const res: IngestResponse = await api.ingestFile(file, {
          collection, source_type: st, repo, framework, module, sprint,
        });
        setLog(prev => [{
          id: `${Date.now()}-${file.name}`,
          filename: file.name,
          collection: res.collection,
          indexed: res.indexed,
          skipped: res.skipped,
          status: "success",
        }, ...prev]);
      } catch (err) {
        setLog(prev => [{
          id: `${Date.now()}-${file.name}`,
          filename: file.name,
          collection,
          indexed: 0, skipped: 0,
          status: "error",
          error: err instanceof Error ? err.message : "unknown error",
        }, ...prev]);
      }
    }

    setFiles([]);
    setLoading(false);
  }

  const totalIndexed = log.filter(l => l.status === "success").reduce((s, l) => s + l.indexed, 0);
  const totalSkipped = log.filter(l => l.status === "success").reduce((s, l) => s + l.skipped, 0);

  const ingestSidebar = (
    <>
        {/* Supported formats */}
        <div className="px-5 py-5">
          <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
             style={{ fontFamily: "Courier New, monospace" }}>
            Supported Formats
          </p>
          <ul className="space-y-2">
            {SOURCE_TYPES.map(st => (
              <li key={st.value} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-[12px] text-stone-700 font-medium">{st.label}</p>
                  <p className="text-[10px] text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
                    {st.ext}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t" style={{ borderColor: "#D6D1C8" }} />

        {/* Session stats */}
        {log.length > 0 && (
          <>
            <div className="px-5 py-4">
              <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
                 style={{ fontFamily: "Courier New, monospace" }}>
                Session
              </p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[12px]">
                  <span className="text-stone-500">files</span>
                  <span className="font-bold text-stone-700">{log.length}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-stone-500">indexed</span>
                  <span className="font-bold" style={{ color: "#16A34A" }}>{totalIndexed}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-stone-500">skipped</span>
                  <span className="font-bold text-stone-400">{totalSkipped}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-stone-500">errors</span>
                  <span className="font-bold" style={{ color: log.some(l => l.status === "error") ? "#C2391B" : "#A8A29E" }}>
                    {log.filter(l => l.status === "error").length}
                  </span>
                </div>
              </div>
            </div>
            <div className="border-t" style={{ borderColor: "#D6D1C8" }} />
          </>
        )}

        <div className="px-5 py-3">
          <p className="text-[10px]" style={{ fontFamily: "Courier New, monospace", color: "#A8A29E" }}>
            <span style={{ color: "#78716C" }}>chunking</span> source-aware · incremental SHA256
          </p>
        </div>
    </>
  );

  return (
    <AppShell sidebar={ingestSidebar}>
      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

        <header className="flex items-center justify-between px-8 py-3 border-b flex-shrink-0"
                style={{ background: "#F5F3EE", borderColor: "#D6D1C8" }}>
          <p className="text-xs text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
            upload · chunk · embed · index into Qdrant
          </p>
          <span className="flex items-center gap-1.5 text-[11px] text-stone-500"
                style={{ fontFamily: "Courier New, monospace" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            online
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-2xl mx-auto">

            {/* Hero */}
            <div className="mb-8">
              <div className="text-3xl mb-3 select-none" style={{ color: "#C2391B" }}>✳</div>
              <h2 className="text-4xl font-bold text-stone-900 mb-2"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.02em" }}>
                Ingest
              </h2>
              <p className="text-[14px] text-stone-500 leading-relaxed max-w-lg">
                Upload files into your knowledge base. Each file is chunked semantically,
                embedded, and indexed into Qdrant with incremental SHA256 deduplication —
                re-uploading unchanged files is safe and fast.
              </p>
            </div>

            {/* Target collection */}
            <div className="bg-white border rounded-xl p-5 shadow-sm mb-4"
                 style={{ borderColor: "#D6D1C8" }}>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[10px] tracking-widest uppercase text-stone-400"
                   style={{ fontFamily: "Courier New, monospace" }}>
                  Target Collection
                </p>
                {autoCollection && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border"
                        style={{
                          fontFamily: "Courier New, monospace",
                          color:       autoCollectionStrong ? "#16A34A" : "#B45309",
                          borderColor: autoCollectionStrong ? "#BBF7D0" : "#FDE68A",
                          background:  autoCollectionStrong ? "#F0FDF4" : "#FFFBEB",
                        }}>
                    {autoCollectionStrong ? "matched from filename" : "suggested default — please verify"}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {KNOWLEDGE_BASE.map(kb => (
                  <button key={kb.name}
                    onClick={() => { setCollection(kb.name); setAutoCollection(false); setAutoCollectionStrong(false); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] text-left transition-all ${
                      collection === kb.name
                        ? "border-stone-600 bg-stone-800 text-white"
                        : "text-stone-600 hover:border-stone-400"
                    }`}
                    style={{ borderColor: collection === kb.name ? "#1C1917" : "#D6D1C8" }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: kb.color }} />
                    <span className="truncate">{kb.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Source type + metadata */}
            <div className="bg-white border rounded-xl p-5 shadow-sm mb-4"
                 style={{ borderColor: "#D6D1C8" }}>
              <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
                 style={{ fontFamily: "Courier New, monospace" }}>
                Source Type & Metadata
              </p>

              <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-all ${
                    autoDetect ? "border-stone-600 bg-stone-700" : "border-stone-300"
                  }`} onClick={() => setAutoDetect(a => !a)}>
                    {autoDetect && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[13px] text-stone-700">Auto-detect <span className="text-stone-400">source type</span> from extension</span>
                </label>
              </div>

              {!autoDetect && (
                <div className="mb-3">
                  <div className="relative">
                    <select
                      value={sourceType}
                      onChange={e => setSourceType(e.target.value)}
                      className="w-full appearance-none text-[13px] text-stone-700 border rounded-lg px-3 py-2 pr-7 focus:outline-none focus:border-stone-400 cursor-pointer"
                      style={{ background: "#F8F7F4", borderColor: "#D6D1C8" }}>
                      {SOURCE_TYPES.map(st => (
                        <option key={st.value} value={st.value}>{st.label} ({st.ext})</option>
                      ))}
                    </select>
                    <svg className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                         fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "repo",      label: "Repo",      val: repo,      set: setRepo,      ph: "e.g. selenium-framework" },
                  { key: "framework", label: "Framework",  val: framework, set: setFramework, ph: "e.g. selenium" },
                  { key: "module",    label: "Module",     val: module,    set: setModule,    ph: "e.g. login" },
                  { key: "sprint",    label: "Sprint",     val: sprint,    set: setSprint,    ph: "e.g. Sprint-17" },
                ].map(({ key, label, val, set, ph }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-[10px] tracking-widest uppercase text-stone-400"
                           style={{ fontFamily: "Courier New, monospace" }}>
                      {label}
                    </label>
                    <input
                      type="text"
                      value={val}
                      onChange={e => set(e.target.value)}
                      placeholder={ph}
                      className="bg-stone-50 border rounded-lg px-3 py-1.5 text-[13px] text-stone-700 placeholder-stone-300 focus:outline-none focus:border-stone-400 transition-colors"
                      style={{ borderColor: "#D6D1C8" }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-4"
              style={{
                borderColor: dragging ? "#C2391B" : "#C8C3BA",
                background: dragging ? "#FEF3F0" : "#FAFAF8",
              }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
              <div className="text-3xl mb-2 select-none" style={{ color: dragging ? "#C2391B" : "#C8C3BA" }}>
                ↑
              </div>
              <p className="text-[14px] font-medium text-stone-600 mb-1">
                {dragging ? "Drop files here" : "Drag files here or click to browse"}
              </p>
              <p className="text-[12px] text-stone-400">
                Multiple files supported · source type auto-detected from extension
              </p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="bg-white border rounded-xl shadow-sm mb-4 overflow-hidden"
                   style={{ borderColor: "#D6D1C8" }}>
                <div className="flex items-center justify-between px-4 py-3 border-b"
                     style={{ borderColor: "#F0EDE7" }}>
                  <p className="text-[11px] text-stone-500" style={{ fontFamily: "Courier New, monospace" }}>
                    {files.length} file{files.length !== 1 ? "s" : ""} queued
                  </p>
                  <button onClick={() => setFiles([])}
                          className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                          style={{ fontFamily: "Courier New, monospace" }}>
                    clear all
                  </button>
                </div>
                <ul className="divide-y" style={{ borderColor: "#F0EDE7" }}>
                  {files.map(f => (
                    <li key={f.name} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] px-1.5 py-0.5 rounded border text-stone-400 flex-shrink-0"
                              style={{ fontFamily: "Courier New, monospace", borderColor: "#D6D1C8" }}>
                          {autoDetect ? detectSourceType(f.name) : sourceType}
                        </span>
                        <span className="text-[13px] text-stone-700 truncate font-mono">{f.name}</span>
                        <span className="text-[11px] text-stone-400 flex-shrink-0">
                          {(f.size / 1024).toFixed(1)}kb
                        </span>
                      </div>
                      <button onClick={() => removeFile(f.name)}
                              className="ml-3 text-stone-300 hover:text-stone-500 transition-colors flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="px-4 py-3 border-t" style={{ borderColor: "#F0EDE7" }}>
                  <button
                    onClick={runIngest}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl text-[13px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                    style={{ background: "#1C1917" }}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Indexing…
                      </span>
                    ) : `Index ${files.length} file${files.length !== 1 ? "s" : ""} into ${KNOWLEDGE_BASE.find(k => k.name === collection)?.label ?? collection}`}
                  </button>
                </div>
              </div>
            )}

            {/* Ingest log */}
            {log.length > 0 && (
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden"
                   style={{ borderColor: "#D6D1C8" }}>
                <div className="flex items-center justify-between px-4 py-3 border-b"
                     style={{ borderColor: "#F0EDE7" }}>
                  <p className="text-[11px] text-stone-500" style={{ fontFamily: "Courier New, monospace" }}>
                    ingest log
                  </p>
                  <button onClick={() => setLog([])}
                          className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                          style={{ fontFamily: "Courier New, monospace" }}>
                    clear
                  </button>
                </div>
                <ul className="divide-y" style={{ borderColor: "#F0EDE7" }}>
                  {log.map(item => (
                    <li key={item.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          item.status === "success" ? "bg-green-500" : "bg-red-500"
                        }`} />
                        <span className="text-[13px] text-stone-700 truncate font-mono">{item.filename}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border text-stone-400 flex-shrink-0"
                              style={{ fontFamily: "Courier New, monospace", borderColor: "#D6D1C8" }}>
                          {item.collection}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        {item.status === "success" ? (
                          <>
                            <span className="text-[11px] font-bold" style={{ color: "#16A34A" }}>
                              +{item.indexed}
                            </span>
                            {item.skipped > 0 && (
                              <span className="text-[11px] text-stone-400">
                                {item.skipped} skipped
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px]" style={{ color: "#C2391B" }}>
                            {item.error}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
