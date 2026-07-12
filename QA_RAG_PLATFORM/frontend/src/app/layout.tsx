"use client";
import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import { useState } from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <html lang="en">
      <head><title>QA RAG Platform</title></head>
      <body className="bg-[#0a0a0f] text-gray-100 min-h-screen flex">
        <QueryClientProvider client={qc}>
          <Sidebar />
          <main className="flex-1 ml-56 min-h-screen overflow-auto">
            {children}
          </main>
        </QueryClientProvider>
      </body>
    </html>
  );
}
