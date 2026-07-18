import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QA Intelligence Platform",
  description: "Enterprise QA Knowledge Platform — chat, search, RCA, RTM, coverage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#080C18] text-[#F1F5F9] min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
