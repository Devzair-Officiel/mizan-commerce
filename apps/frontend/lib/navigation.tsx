import { Sparkles } from 'lucide-react';
import type { CatalogKind, ModuleKey } from '@/lib/hooks/useMe';
import type { Feature } from '@/lib/hooks/usePlanGating';
import { useShop } from '@/lib/hooks/useShop';

export type Gate = { kind: 'module'; module: ModuleKey } | { kind: 'admin' };

export type NavLabelKey =
  | 'dashboard' | 'orders' | 'customers' | 'products' | 'invoices'
  | 'stock' | 'reminders' | 'notes' | 'zakat' | 'profile' | 'settings'
  | 'group_sell' | 'group_catalog' | 'group_track'
  | 'articles' | 'catalogue' | 'services' | 'articles_and_services';

export type BadgeKey = 'orders_to_prepare' | 'low_stock' | 'reminders_due';

export type NavEntry = {
  href: string;
  labelKey: NavLabelKey;
  icon: (props: { className?: string }) => React.JSX.Element;
  gate?: Gate;
  feature?: Feature;
  badgeKey?: BadgeKey;
};

export type NavGroup = {
  titleKey?: 'group_sell' | 'group_catalog' | 'group_track';
  entries: readonly NavEntry[];
};

export function passesGate(
  gate: Gate | undefined,
  membership: { is_admin: boolean; permissions: ModuleKey[] } | null,
): boolean {
  if (!gate) return true;
  if (!membership) return false;
  if (gate.kind === 'admin') return membership.is_admin;
  if (membership.is_admin) return true;
  return membership.permissions.includes(gate.module);
}

export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/stock') {
    return pathname === '/stock' || pathname.startsWith('/stock/');
  }
  return pathname === href || pathname.startsWith(href + '/');
}

export function getNavGroups(catalogKind: CatalogKind): readonly NavGroup[] {
  const productsLabelKey: NavLabelKey =
    catalogKind === 'products' ? 'articles'
    : catalogKind === 'services' ? 'services'
    : 'articles_and_services';
  const productsEntry: NavEntry = {
    href: '/products',
    labelKey: productsLabelKey,
    icon: catalogKind === 'services' ? SparklesNavIcon : PackageIcon,
    gate: { kind: 'module', module: 'products' },
    feature: 'products',
  };
  const ordersEntry: NavEntry = { href: '/orders', labelKey: 'orders', icon: ShoppingBagIcon, gate: { kind: 'module', module: 'orders' }, feature: 'orders', badgeKey: 'orders_to_prepare' };
  const customersEntry: NavEntry = { href: '/customers', labelKey: 'customers', icon: UsersIcon, gate: { kind: 'module', module: 'customers' } };
  const invoicesEntry: NavEntry = { href: '/invoices', labelKey: 'invoices', icon: ReceiptIcon, gate: { kind: 'module', module: 'invoices' }, feature: 'invoices' };
  const sellEntries: readonly NavEntry[] = catalogKind === 'services'
    ? [ordersEntry, customersEntry, productsEntry, invoicesEntry]
    : [ordersEntry, customersEntry, invoicesEntry];
  const groups: NavGroup[] = [
    { entries: [{ href: '/dashboard', labelKey: 'dashboard', icon: HomeIcon, gate: { kind: 'module', module: 'dashboard' } }] },
    { titleKey: 'group_sell', entries: sellEntries },
  ];
  if (catalogKind !== 'services') {
    groups.push({
      titleKey: 'group_catalog',
      entries: [
        productsEntry,
        { href: '/stock', labelKey: 'stock', icon: ArchiveIcon, gate: { kind: 'module', module: 'stock' }, feature: 'stock', badgeKey: 'low_stock' },
      ],
    });
  }
  groups.push({
    titleKey: 'group_track',
    entries: [
      { href: '/reminders', labelKey: 'reminders', icon: BellIcon, feature: 'reminders', badgeKey: 'reminders_due' },
      { href: '/notes', labelKey: 'notes', icon: NoteIcon, feature: 'notes' },
      { href: '/zakat', labelKey: 'zakat', icon: ZakatIcon, gate: { kind: 'admin' }, feature: 'zakat' },
    ],
  });
  return groups;
}

export function useNavGroups(): readonly NavGroup[] {
  const { data: shop } = useShop();
  return getNavGroups(shop?.catalog_kind ?? 'both');
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    entries: [
      { href: '/dashboard', labelKey: 'dashboard', icon: HomeIcon, gate: { kind: 'module', module: 'dashboard' } },
    ],
  },
  {
    titleKey: 'group_sell',
    entries: [
      { href: '/orders',   labelKey: 'orders',   icon: ShoppingBagIcon, gate: { kind: 'module', module: 'orders' },   feature: 'orders',   badgeKey: 'orders_to_prepare' },
      { href: '/customers',labelKey: 'customers', icon: UsersIcon,       gate: { kind: 'module', module: 'customers' } },
      { href: '/invoices', labelKey: 'invoices',  icon: ReceiptIcon,     gate: { kind: 'module', module: 'invoices' }, feature: 'invoices' },
    ],
  },
  {
    titleKey: 'group_catalog',
    entries: [
      { href: '/products', labelKey: 'products', icon: PackageIcon, gate: { kind: 'module', module: 'products' }, feature: 'products' },
      { href: '/stock',    labelKey: 'stock',    icon: ArchiveIcon,  gate: { kind: 'module', module: 'stock' },    feature: 'stock',    badgeKey: 'low_stock' },
    ],
  },
  {
    titleKey: 'group_track',
    entries: [
      { href: '/reminders', labelKey: 'reminders', icon: BellIcon,  feature: 'reminders', badgeKey: 'reminders_due' },
      { href: '/notes',     labelKey: 'notes',     icon: NoteIcon,  feature: 'notes' },
      { href: '/zakat',     labelKey: 'zakat',     icon: ZakatIcon, gate: { kind: 'admin' }, feature: 'zakat' },
    ],
  },
];

export const ACCOUNT_ENTRIES: readonly NavEntry[] = [
  { href: '/profile',  labelKey: 'profile',  icon: ProfileIcon },
  { href: '/settings', labelKey: 'settings', icon: SettingsIcon, gate: { kind: 'admin' } },
];

/* ── Icon components ────────────────────────────────────────────────────── */

function SparklesNavIcon({ className }: { className?: string }) {
  return <Sparkles className={className} />;
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

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
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

export function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
