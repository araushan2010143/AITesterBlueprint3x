'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LayoutDashboard, List, BarChart2, FileText, Mail, Send, GraduationCap, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem { href: string; label: string; icon: LucideIcon }

const mainNav: NavItem[] = [
  { href: '/tracker',      label: 'Kanban Board',     icon: LayoutDashboard },
  { href: '/applications', label: 'All Applications', icon: List },
  { href: '/analytics',    label: 'Analytics',        icon: BarChart2 },
];

const aiNav: NavItem[] = [
  { href: '/ai/resume',       label: 'Resume Tailoring', icon: FileText },
  { href: '/ai/cover-letter', label: 'Cover Letter',     icon: Mail },
  { href: '/ai/cold-email',   label: 'Cold Email',       icon: Send },
  { href: '/ai/prep',         label: 'Interview Prep',   icon: GraduationCap },
  { href: '/settings',        label: 'Settings',         icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function NavLink({ item }: { item: NavItem }) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    const Icon = item.icon;
    return (
      <Link href={item.href} onClick={() => setOpen(false)}>
        <div className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
          isActive
            ? 'bg-indigo-600 text-white font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}>
          <Icon className="h-4 w-4 shrink-0" />
          {item.label}
        </div>
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="md:hidden flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={cn(
        'fixed top-0 left-0 z-50 h-full w-72 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-in-out md:hidden',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 5a2 2 0 012-2h8a2 2 0 012 2v1H2V5z" fill="white" fillOpacity=".9"/>
                <rect x="2" y="7" width="12" height="7" rx="1" fill="white" fillOpacity=".9"/>
                <rect x="5" y="4" width="2" height="2" rx=".5" fill="#6366f1"/>
                <rect x="9" y="4" width="2" height="2" rx=".5" fill="#6366f1"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">JOB Tracker AI</p>
              <p className="text-xs text-muted-foreground">AI Career OS</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-5 overflow-y-auto">
          <div className="space-y-0.5">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Workspace</p>
            {mainNav.map((item) => <NavLink key={item.href} item={item} />)}
          </div>
          <div className="space-y-0.5">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">AI Tools</p>
            {aiNav.map((item) => <NavLink key={item.href} item={item} />)}
          </div>
        </nav>
      </div>
    </>
  );
}
