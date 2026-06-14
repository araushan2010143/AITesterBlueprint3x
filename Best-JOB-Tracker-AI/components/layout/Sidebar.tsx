'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  List,
  BarChart2,
  FileText,
  Mail,
  Send,
  GraduationCap,
  Settings,
  Bookmark,
  type LucideIcon,
} from 'lucide-react';
import { useApplications } from '@/hooks/useApplications';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const mainNav: NavItem[] = [
  { href: '/tracker',      label: 'Kanban Board',     icon: LayoutDashboard },
  { href: '/applications', label: 'All Applications', icon: List },
  { href: '/analytics',    label: 'Analytics',        icon: BarChart2 },
  { href: '/saved',        label: 'Saved Jobs',       icon: Bookmark },
];

const aiNav: NavItem[] = [
  { href: '/ai/resume',       label: 'Resume Tailoring', icon: FileText },
  { href: '/ai/cover-letter', label: 'Cover Letter',     icon: Mail },
  { href: '/ai/cold-email',   label: 'Cold Email',       icon: Send },
  { href: '/ai/prep',         label: 'Interview Prep',   icon: GraduationCap },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <motion.div
        whileHover={{ x: 2 }}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
          isActive
            ? 'bg-indigo-600 text-white font-medium shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.badge != null && item.badge > 0 && (
          <span className={cn(
            'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center',
            isActive ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
          )}>
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </motion.div>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { applications } = useApplications();
  const savedCount = applications.filter(a => a.status === 'bookmarked').length;

  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 5a2 2 0 012-2h8a2 2 0 012 2v1H2V5z" fill="white" fillOpacity=".9"/>
            <rect x="2" y="7" width="12" height="7" rx="1" fill="white" fillOpacity=".9"/>
            <rect x="5" y="4" width="2" height="2" rx=".5" fill="#6366f1"/>
            <rect x="9" y="4" width="2" height="2" rx=".5" fill="#6366f1"/>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">JOB Tracker AI</p>
          <p className="text-xs text-muted-foreground">AI Career OS</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-5 overflow-y-auto">
        <div className="space-y-0.5">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Workspace
          </p>
          {mainNav.map((item) => (
            <NavLink
              key={item.href}
              item={item.href === '/saved' ? { ...item, badge: savedCount } : item}
              pathname={pathname}
            />
          ))}
        </div>

        <div className="space-y-0.5">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            AI Tools
          </p>
          {aiNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border">
        <Link href="/settings">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <Settings className="h-4 w-4" />
            Settings
          </div>
        </Link>
      </div>
    </aside>
  );
}
