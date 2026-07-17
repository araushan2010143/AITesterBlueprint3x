"use client";
import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import CommandPalette from "@/components/CommandPalette";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

function KeepAlive() {
  const [slow, setSlow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    async function ping() {
      // Show banner if API takes >3s (cold start)
      timer.current = setTimeout(() => setSlow(true), 3000);
      try {
        await fetch(`${API}/health`, { signal: AbortSignal.timeout(90_000) });
      } finally {
        clearTimeout(timer.current);
        setSlow(false);
      }
    }

    ping();
    // Ping every 4 minutes to prevent Render free tier spin-down (spins down at 5 min)
    const id = setInterval(ping, 4 * 60 * 1000);
    return () => { clearInterval(id); clearTimeout(timer.current); };
  }, []);

  if (!slow) return null;
  return (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 999, background: "#1c1917", border: "1px solid rgba(245,158,11,0.4)",
      borderRadius: 10, padding: "10px 18px", display: "flex", alignItems: "center",
      gap: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", whiteSpace: "nowrap",
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%", background: "#f59e0b",
        animation: "blink 1s ease infinite",
      }} />
      <span style={{ fontSize: 13, color: "#fcd34d", fontWeight: 600 }}>API waking up…</span>
      <span style={{ fontSize: 11, color: "#78716c" }}>Render free tier · up to 60s</span>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },  // cache for 1 min
  }));
  return (
    <html lang="en">
      <head>
        <title>QA RAG Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: "var(--bg)", margin: 0, minHeight: "100vh", display: "flex" }}>
        <QueryClientProvider client={qc}>
          <KeepAlive />
          <Sidebar />
          <main style={{ flex: 1, minHeight: "100vh", overflow: "auto", background: "var(--bg)", maxWidth: "100vw" }}>
            {children}
          </main>
          <CommandPalette />
          <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: "#111827",
                border: "1px solid rgba(124,58,237,0.2)",
                color: "#F9FAFB",
                fontSize: 13,
              },
            }}
          />
        </QueryClientProvider>
      </body>
    </html>
  );
}
