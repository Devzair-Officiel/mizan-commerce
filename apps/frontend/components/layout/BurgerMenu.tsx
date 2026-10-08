'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Sun, Moon, Palette, User, Settings, LogOut } from 'lucide-react';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { TrialBanner } from '@/components/layout/TrialBanner';
import { useShop } from '@/lib/hooks/useShop';
import { useIsClient } from '@/lib/hooks/useIsClient';
import { useMe } from '@/lib/hooks/useMe';
import { useNavGroups, passesGate, isNavActive, ACCOUNT_ENTRIES, type NavEntry } from '@/lib/navigation';
import { useNavBadges } from '@/lib/hooks/useNavBadges';

/* ── Context ── */
interface BurgerCtx { open: boolean; toggle: () => void; close: () => void; }
const Ctx = createContext<BurgerCtx>({ open: false, toggle: () => {}, close: () => {} });
export function useBurger() { return useContext(Ctx); }

export function BurgerMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close  = useCallback(() => setOpen(false), []);
  return <Ctx.Provider value={{ open, toggle, close }}>{children}</Ctx.Provider>;
}

export function BurgerButton() {
  const tc = useTranslations('layout.common');
  const { toggle } = useBurger();
  return (
    <button onClick={toggle} aria-label={tc('menu')} className="flex h-11 w-11 flex-col items-center justify-center gap-1.5">
      <span className="h-0.5 w-5 rounded-full bg-foreground transition-all" />
      <span className="h-0.5 w-5 rounded-full bg-foreground transition-all" />
      <span className="h-0.5 w-3.5 rounded-full bg-foreground transition-all" />
    </button>
  );
}

/* ── Bottom nav hrefs to exclude from BurgerMenu ── */
const BOTTOM_NAV_HREFS = new Set(['/dashboard', '/customers', '/orders', '/products']);

function BadgeDot({ count, danger }: { count: number; danger?: boolean }) {
  if (count === 0) return null;
  return (
    <span className={`ms-auto min-w-[20px] h-5 rounded-full text-[11px] font-bold flex items-center justify-center px-1.5 leading-none ${
      danger ? 'bg-red-500 text-white' : 'bg-secondary text-secondary-foreground'
    }`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

function MenuNavItem({ entry, active, onNav, badge }: { entry: NavEntry; active: boolean; onNav: (href: string) => void; badge?: number }) {
  const t = useTranslations('layout.nav');
  const Icon = entry.icon;
  const isDanger = entry.badgeKey === 'low_stock';
  return (
    <button
      onClick={() => onNav(entry.href)}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 min-h-[48px] text-sm font-medium transition-all text-start ${
        active ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : ''}`} />
      <span className="flex-1 text-[15px]">{t(entry.labelKey)}</span>
      {(badge ?? 0) > 0 && <BadgeDot count={badge!} danger={isDanger} />}
    </button>
  );
}

export function BurgerMenuDrawer() {
  const tc = useTranslations('layout.common');
  const tNav = useTranslations('layout.nav');
  const tBurger = useTranslations('layout.burgerMenu');
  const { open, close } = useBurger();
  const router   = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: shop } = useShop();
  const membership = me?.membership ?? null;
  const { data: badges } = useNavBadges();
  const navGroups = useNavGroups();

  // Filter nav entries: exclude what's already in the bottom nav
  const filteredGroups = navGroups
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        (e) => !BOTTOM_NAV_HREFS.has(e.href) && passesGate(e.gate, membership),
      ),
    }))
    .filter((group) => group.entries.length > 0);

  const accountEntries = ACCOUNT_ENTRIES.filter((e) => passesGate(e.gate, membership));

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  async function handleLogout() {
    close();
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  function handleNav(href: string) {
    close();
    router.push(href);
  }

  const shopName = shop?.name?.trim();
  const displayName = shopName || tc('shop_fallback');

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-0 z-70 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-hidden={!open}
        aria-label={tc('menu')}
        className={`fixed top-0 inset-s-0 z-80 flex h-dvh flex-col bg-card shadow-xl border-e border-border transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
        style={{ width: 'min(86vw, 21rem)' }}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-5 gap-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {shop?.logo_url && (
              <Image src={shop.logo_url} alt={displayName} width={36} height={36} unoptimized
                className="h-9 w-9 rounded-xl object-cover ring-1 ring-border shrink-0" />
            )}
            <span className="text-base font-semibold text-foreground truncate">{displayName}</span>
          </div>
          <button onClick={close} aria-label={tc('close')}
            className="h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-4">
          {filteredGroups.map((group) => (
            <div key={group.titleKey ?? 'main'}>
              {group.titleKey && (
                <div className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tNav(group.titleKey)}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {group.entries.map((entry) => {
                  const badge = entry.badgeKey ? (badges?.[entry.badgeKey] ?? 0) : 0;
                  return (
                    <MenuNavItem key={entry.href} entry={entry}
                      active={isNavActive(entry.href, pathname)}
                      onNav={handleNav} badge={badge} />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Account section */}
          <div>
            <div className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tBurger('account_section')}
            </div>
            <div className="flex flex-col gap-0.5">
              {accountEntries.map((entry) => (
                <MenuNavItem key={entry.href} entry={entry}
                  active={isNavActive(entry.href, pathname)}
                  onNav={handleNav} />
              ))}
            </div>
          </div>
        </nav>

        {/* Footer: language + theme + trial + logout */}
        <div className="p-3 flex flex-col gap-1 border-t border-border shrink-0"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="px-1 py-2">
            <LanguageSwitcher />
          </div>
          <AppearanceRow />
          <ThemeToggleRow />
          <div className="px-1 py-1">
            <TrialBanner />
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-2xl px-4 min-h-[48px] text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {tc('logout')}
          </button>
        </div>
      </aside>
    </>
  );
}

function AppearanceRow() {
  const tc = useTranslations('layout.common');
  const { close } = useBurger();
  const { toggle } = useThemeDrawer();
  function handleClick() { close(); toggle(); }
  return (
    <button onClick={handleClick}
      className="flex w-full items-center gap-3 rounded-2xl px-4 min-h-[48px] text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
      <Palette className="h-5 w-5 shrink-0" />
      {tc('appearance')}
    </button>
  );
}

function ThemeToggleRow() {
  const tc = useTranslations('layout.common');
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useIsClient();
  if (!mounted) return null;
  const isDark = resolvedTheme === 'dark';
  return (
    <button onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex w-full items-center gap-3 rounded-2xl px-4 min-h-[48px] text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
      {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
      {isDark ? tc('light_mode') : tc('dark_mode')}
    </button>
  );
}
