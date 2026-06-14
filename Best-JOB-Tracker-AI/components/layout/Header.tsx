'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { MobileNav } from '@/components/layout/MobileNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Profile } from '@/types';

interface HeaderProps {
  profile: Profile | null;
}

export function Header({ profile }: HeaderProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const displayName = profile?.full_name ?? profile?.email?.split('@')[0] ?? 'User';
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : (profile?.email?.slice(0, 2).toUpperCase() ?? 'U');

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <MobileNav />
        <h1 className="text-base font-semibold text-foreground hidden sm:block">
          JOB Tracker AI
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 px-1 py-0.5"
            aria-label={`Account menu for ${displayName}`}
          >
            {/* User name visible at all times, not just in dropdown */}
            <span className="text-sm font-medium text-foreground hidden md:block max-w-[120px] truncate">
              {displayName}
            </span>
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
              <AvatarFallback className="bg-indigo-600 text-white text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-2 py-2">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              {profile?.target_role && (
                <p className="text-xs text-indigo-500 mt-0.5 truncate">🎯 {profile.target_role}</p>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')} className="gap-2">
              <Settings className="h-3.5 w-3.5" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
