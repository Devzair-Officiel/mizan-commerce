'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Palette } from 'lucide-react';
import { ThemeToggleButton } from '@/components/ui/ThemeToggle';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { useMe, type ModuleKey } from '@/lib/hooks/useMe';
import { usePlanGating, type Feature } from '@/lib/hooks/usePlanGating';

type NavKey =
  | 'dashboard' | 'orders' | 'customers' | 'products'
  | 'invoices'  | 'stock_in' | 'stock_out' | 'reminders'
  | 'notes'     | 'zakat'    | 'profile'   | 'settings';

type Gate = { kind: 'module'; module: ModuleKey } | { kind: 'admin' };

type NavEntry = {
  href: string;
  labelKey: NavKey;
  icon: (props: { className?: string }) => React.JSX.Element;
  gate?: Gate;
  feature?: Feature;
};

const PRIMARY_NAV: readonly NavEntry[] = [
  { href: '/dashboard',  labelKey: 'dashboard',  icon: HomeIcon,         gate: { kind: 'module', module: 'dashboard' } },
  { href: '/orders',     labelKey: 'orders',     icon: ShoppingBagIcon,  gate: { kind: 'module', module: 'orders' },    feature: 'orders' },
  { href: '/customers',  labelKey: 'customers',  icon: UsersIcon,        gate: { kind: 'module', module: 'customers' } },
  { href: '/products',   labelKey: 'products',   icon: PackageIcon,      gate: { kind: 'module', module: 'products' },  feature: 'products' },
];

const SECONDARY_NAV: readonly NavEntry[] = [
  { href: '/invoices',   labelKey: 'invoices',  icon: ReceiptIcon,   gate: { kind: 'module', module: 'invoices' }, feature: 'invoices' },
  { href: '/stock/add',  labelKey: 'stock_in',  icon: BoxInIcon,     gate: { kind: 'module', module: 'stock' },    feature: 'stock' },
  { href: '/stock/out',  labelKey: 'stock_out', icon: BoxOutIcon,    gate: { kind: 'module', module: 'stock' },    feature: 'stock' },
  { href: '/reminders',  labelKey: 'reminders', icon: BellIcon,                                                    feature: 'reminders' },
  { href: '/notes',      labelKey: 'notes',     icon: NoteIcon,                                                    feature: 'notes' },
  { href: '/zakat',      labelKey: 'zakat',     icon: ZakatIcon,     gate: { kind: 'admin' },                      feature: 'zakat' },
  { href: '/profile',    labelKey: 'profile',   icon: ProfileIcon },
  { href: '/settings',   labelKey: 'settings',  icon: SettingsIcon,  gate: { kind: 'admin' } },
];

function passesGate(gate: Gate | undefined, membership: { is_admin: boolean; permissions: ModuleKey[] } | null): boolean {
  if (!gate) return true;
  if (!membership) return false;
  if (gate.kind === 'admin') return membership.is_admin;
  if (membership.is_admin) return true;
  return membership.permissions.includes(gate.module);
}

export function DesktopSidebar() {
  const tNav = useTranslations('layout.nav');
  const tc = useTranslations('layout.common');
  const pathname = usePathname();
  const router = useRouter();
  const { toggle: toggleThemeDrawer } = useThemeDrawer();
  const { data: me } = useMe();
  const membership = me?.membership ?? null;
  const { can } = usePlanGating();

  const allowed = (e: NavEntry) =>
    passesGate(e.gate, membership) && (e.feature ? can(e.feature) : true);

  const primaryNav = PRIMARY_NAV.filter(allowed);
  const secondaryNav = SECONDARY_NAV.filter(allowed);
  const canCreateOrder = passesGate({ kind: 'module', module: 'orders' }, membership) && can('orders');

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 fixed inset-y-0 inset-s-0 z-30 border-e border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-border shrink-0">
        <span className="text-xl font-bold text-primary tracking-tight">Mizan</span>
        <ThemeToggleButton />
      </div>

      {/* Nouvelle vente */}
      {canCreateOrder && (
        <div className="px-3 pt-4 pb-2">
          <Link
            href="/orders/new"
            className="flex items-center gap-2.5 w-full rounded-xl px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'var(--primary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {tNav('new_sale')}
          </Link>
        </div>
      )}

      {/* Navigation principale */}
      <nav className="flex flex-col gap-0.5 px-3 py-2">
        {primaryNav.map(({ href, labelKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive(href)
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {tNav(labelKey)}
          </Link>
        ))}
      </nav>

      <div className="mx-3 border-t border-border" />

      {/* Navigation secondaire */}
      <nav className="flex flex-col gap-0.5 px-3 py-2 flex-1 overflow-y-auto">
        {secondaryNav.map(({ href, labelKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive(href)
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {tNav(labelKey)}
          </Link>
        ))}
      </nav>

      {/* Apparence + Déconnexion */}
      <div className="p-3 border-t border-border flex flex-col gap-0.5">
        <button
          onClick={toggleThemeDrawer}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Palette className="h-5 w-5 shrink-0" />
          {tc('appearance')}
        </button>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogoutIcon className="h-5 w-5 shrink-0" />
          {tc('logout')}
        </button>
      </div>
    </aside>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
    </svg>
  );
}

function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-5M9 20H4v-2a4 4 0 015-5m6 0a4 4 0 11-8 0 4 4 0 018 0zm6-8a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m-9 5l2-1.5L11 21l2-1.5L15 21l2-1.5L19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16z" />
    </svg>
  );
}

function BoxInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v4m0 0l-2-2m2 2l2-2" />
    </svg>
  );
}

function BoxOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0 0l-2 2m2-2l2 2" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ZakatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
