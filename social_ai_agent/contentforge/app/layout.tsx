import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ContentForge',
  description: 'Automated AI content generation pipeline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-900">
        <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
              CF
            </div>
            <span className="font-semibold text-slate-100">ContentForge</span>
            <span className="text-slate-500 text-xs ml-1">AI Content Pipeline</span>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
