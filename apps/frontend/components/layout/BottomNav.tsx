'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { useNavBadges } from '@/lib/hooks/useNavBadges';

const ENTRY_SCREEN_PATTERNS = [
  /^\/orders\/new$/,
  /^\/orders\/[^/]+\/edit$/,
  /^\/products\/new$/,
  /^\/products\/[^/]+\/edit$/,
  /^\/customers\/new$/,
  /^\/customers\/[^/]+\/edit$/,
  /^\/stock\/add$/,
  /^\/stock\/out$/,
  /^\/stock\/import-invoice$/,
  /^\/zakat\/new$/,
];

function isEntryScreen(pathname: string): boolean {
  return ENTRY_SCREEN_PATTERNS.some((re) => re.test(pathname));
}

function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
}

function NavItem({ href, label, icon, active, badge }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]"
    >
      <span className={`relative flex items-center justify-center h-[30px] w-[52px] rounded-full transition-colors ${active ? 'bg-secondary' : ''}`}>
        <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
        {(badge ?? 0) > 0 && (
          <span className="absolute -top-0.5 -end-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {(badge ?? 0) > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className={`text-[0.6875rem] leading-none ${active ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </Link>
  );
}

function SellButton({ label }: { label: string }) {
  return (
    <Link
      href="/orders/new"
      aria-label={label}
      className="flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[56px] py-2"
    >
      <span className="flex items-center justify-center h-[52px] w-[52px] rounded-full bg-primary shadow-[0_4px_14px_-2px_rgba(0,0,0,0.25)] -mt-3 active:scale-95 transition-transform">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="text-[0.6875rem] leading-none text-muted-foreground">{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const t = useTranslations('layout.nav');
  const tBottom = useTranslations('layout.bottomNav');
  const pathname = usePathname();
  const kind = useCatalogKind();
  const { data: badges } = useNavBadges();

  if (isEntryScreen(pathname)) return null;

  const catalogLabel = kind === 'services' ? t('services') : kind === 'products' ? t('articles') : t('catalogue');

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-end justify-around">
        <NavItem href="/dashboard" label={t('dashboard')} active={isNavActive('/dashboard', pathname)}
          icon={<HomeIcon />} />
        <NavItem href="/customers" label={t('customers')} active={isNavActive('/customers', pathname)}
          icon={<UsersIcon />} />
        <SellButton label={tBottom('sell')} />
        <NavItem href="/orders" label={t('orders')} active={isNavActive('/orders', pathname)}
          icon={<ShoppingBagIcon />} badge={badges?.orders_to_prepare} />
        <NavItem href="/products" label={catalogLabel} active={isNavActive('/products', pathname)}
          icon={<PackageIcon />} />
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7m-9 2v8m4-8v8m-4 0h4" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-5M9 20H4v-2a4 4 0 015-5m6 0a4 4 0 11-8 0 4 4 0 018 0zm6-8a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function ShoppingBagIcon() {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}
function PackageIcon() {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
    </svg>
  );
}
