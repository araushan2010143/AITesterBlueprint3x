import type { Metadata } from "next";
import "./globals.css";
import CommandPalette from "@/components/CommandPalette";
import Toast from "@/components/Toast";

export const metadata: Metadata = {
  title: "QA Buddy",
  description: "Enterprise QA Knowledge Platform — chat, search, RCA, RTM, coverage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" style={{ background: "#F5F3EE" }}>
        {children}
        <CommandPalette />
        <Toast />
      </body>
    </html>
  );
}
