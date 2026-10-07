'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Palette } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { useMe, type ModuleKey } from '@/lib/hooks/useMe';
import { usePlanGating, type Feature } from '@/lib/hooks/usePlanGating';
import { useShop } from '@/lib/hooks/useShop';
import {
  passesGate,
  isNavActive,
  NAV_GROUPS,
  ACCOUNT_ENTRIES,
  type NavGroup,
  type NavLabelKey,
} from '@/lib/navigation';
import { SidebarTrialCard } from './TrialBanner';

export function DesktopSidebar() {
  const tNav = useTranslations('layout.nav');
  const pathname = usePathname();
  const router = useRouter();
  const { toggle: toggleThemeDrawer } = useThemeDrawer();
  const { data: me } = useMe();
  const { data: shop } = useShop();
  const membership = me?.membership ?? null;
  const { can } = usePlanGating();

  const canCreateOrder =
    passesGate({ kind: 'module', module: 'orders' }, membership) && can('orders');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 fixed inset-y-0 inset-s-0 z-30 border-e border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
        <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold select-none">
          M
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground leading-tight">Mizan</div>
          {shop?.name && (
            <div className="text-xs text-muted-foreground truncate leading-tight">{shop.name}</div>
          )}
        </div>
      </div>

      {/* Nouvelle vente */}
      {canCreateOrder && (
        <div className="px-3 pt-4 pb-2">
          <Link
            href="/orders/new"
            className="flex items-center justify-center gap-2.5 w-full rounded-full h-11 px-4 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'var(--primary)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {tNav('new_sale')}
          </Link>
        </div>
      )}

      {/* Navigation groupée */}
      <nav className="flex flex-col flex-1 overflow-y-auto px-3 py-2 gap-0.5">
        {NAV_GROUPS.map((group, idx) => (
          <SidebarNavGroup
            key={idx}
            group={group}
            membership={membership}
            can={can}
            pathname={pathname}
          />
        ))}
      </nav>

      {/* Footer : carte essai + menu compte */}
      <div className="pb-3 border-t border-border pt-3">
        <SidebarTrialCard />
        <SidebarAccountMenu
          me={me ?? null}
          membership={membership}
          pathname={pathname}
          onLogout={handleLogout}
          toggleThemeDrawer={toggleThemeDrawer}
        />
      </div>
    </aside>
  );
}

/* ── SidebarNavGroup ──────────────────────────────────────────────────── */

function SidebarNavGroup({
  group,
  membership,
  can,
  pathname,
}: {
  group: NavGroup;
  membership: { is_admin: boolean; permissions: ModuleKey[] } | null;
  can: (feature: Feature) => boolean;
  pathname: string;
}) {
  const tNav = useTranslations('layout.nav');

  const visible = group.entries.filter(
    (e) => passesGate(e.gate, membership) && (e.feature ? can(e.feature) : true),
  );

  if (visible.length === 0) return null;

  return (
    <div className={group.titleKey ? 'mt-3' : ''}>
      {group.titleKey && (
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground select-none">
          {tNav(group.titleKey)}
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {visible.map(({ href, labelKey, icon: Icon }) => {
          const active = isNavActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl ps-3 pe-3 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-secondary text-secondary-foreground font-semibold'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}
              />
              {tNav(labelKey as NavLabelKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── SidebarAccountMenu ───────────────────────────────────────────────── */

function SidebarAccountMenu({
  me,
  membership,
  pathname,
  onLogout,
  toggleThemeDrawer,
}: {
  me: { full_name: string } | null;
  membership: { is_admin: boolean; permissions: ModuleKey[] } | null;
  pathname: string;
  onLogout: () => void;
  toggleThemeDrawer: () => void;
}) {
  const tNav = useTranslations('layout.nav');
  const tc = useTranslations('layout.common');
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
      <Menu.Trigger className="flex w-full items-center gap-3 rounded-xl ps-3 pe-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors data-popup-open:bg-muted outline-none mx-0 px-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
          {initials}
        </span>
        <span className="flex-1 truncate text-start">{me?.full_name ?? '—'}</span>
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
                  className={`flex items-center gap-3 rounded-lg ps-3 pe-3 py-2.5 text-sm cursor-pointer transition-colors outline-none ${
                    active
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-foreground hover:bg-muted'
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
            <Menu.Item
              className="flex items-center gap-3 rounded-lg ps-3 pe-3 py-2.5 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors outline-none"
              onClick={toggleThemeDrawer}
            >
              <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
              {tc('appearance')}
            </Menu.Item>
            <Menu.Item
              className="flex items-center gap-3 rounded-lg ps-3 pe-3 py-2.5 text-sm text-foreground hover:bg-muted cursor-pointer transition-colors outline-none"
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

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
