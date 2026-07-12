"use client";
import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import { useState } from "react";

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
          <main style={{ marginLeft: 220, flex: 1, minHeight: "100vh", overflow: "auto", background: "var(--bg)" }}>
            {children}
          </main>
        </QueryClientProvider>
      </body>
    </html>
  );
}
