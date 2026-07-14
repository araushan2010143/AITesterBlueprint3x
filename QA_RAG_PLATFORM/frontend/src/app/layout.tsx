"use client";
import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import CommandPalette from "@/components/CommandPalette";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
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
          <Sidebar />
          <main style={{ flex: 1, minHeight: "100vh", overflow: "auto", background: "var(--bg)" }}>
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
