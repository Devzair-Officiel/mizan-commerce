'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Palette } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import { isNavActive, ACCOUNT_ENTRIES, passesGate, type NavLabelKey } from '@/lib/navigation';
import { LogoutIcon } from '@/lib/navigation';
import type { ModuleKey, ShopRole } from '@/lib/hooks/useMe';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

export function SidebarAccountMenu({
  me,
  membership,
  pathname,
  onLogout,
  toggleThemeDrawer,
}: {
  me: { full_name: string } | null;
  membership: { is_admin: boolean; permissions: ModuleKey[]; role: ShopRole } | null;
  pathname: string;
  onLogout: () => void;
  toggleThemeDrawer: () => void;
}) {
  const tNav = useTranslations('layout.nav');
  const tc = useTranslations('layout.common');
  const tTeam = useTranslations('team');
  const router = useRouter();

  const initials =
    me?.full_name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? '')
      .join('') ?? '?';

  const allowedAccountEntries = ACCOUNT_ENTRIES.filter((e) =>
    passesGate(e.gate, membership),
  );

  return (
    <Menu.Root>
      <Menu.Trigger className="flex w-full items-center gap-3 rounded-xl ps-3 pe-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors data-popup-open:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none outline-none mx-0 px-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
          {initials}
        </span>
        <span className="flex-1 min-w-0 text-start">
          <span className="block truncate">{me?.full_name ?? '—'}</span>
          {membership && (
            <span className="block truncate text-xs text-muted-foreground font-normal">
              {tTeam(`role.${membership.role}`)}
            </span>
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground shrink-0">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={6} className="z-50 w-52">
          <Menu.Popup className="rounded-xl border border-border bg-card shadow-lg p-1 outline-none">
            {allowedAccountEntries.map(({ href, labelKey, icon: Icon }) => {
              const active = isNavActive(href, pathname);
              return (
                <Menu.Item
                  key={href}
                  className={`flex items-center gap-3 rounded-lg ps-3 pe-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    active
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-foreground hover:bg-muted data-highlighted:bg-muted'
                  }`}
                  onClick={() => router.push(href)}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  {tNav(labelKey as NavLabelKey)}
                </Menu.Item>
              );
            })}
            <Menu.Separator className="my-1 border-t border-border" />
            <div className="px-1 py-1">
              <LanguageSwitcher />
            </div>
            <Menu.Separator className="my-1 border-t border-border" />
            <Menu.Item
              className="flex items-center gap-3 rounded-lg ps-3 pe-3 py-2.5 text-sm text-foreground hover:bg-muted data-highlighted:bg-muted cursor-pointer transition-colors"
              onClick={toggleThemeDrawer}
            >
              <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
              {tc('appearance')}
            </Menu.Item>
            <Menu.Item
              className="flex items-center gap-3 rounded-lg ps-3 pe-3 py-2.5 text-sm text-foreground hover:bg-muted data-highlighted:bg-muted cursor-pointer transition-colors"
              onClick={onLogout}
            >
              <LogoutIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {tc('logout')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
