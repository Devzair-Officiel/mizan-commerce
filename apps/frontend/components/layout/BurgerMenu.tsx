'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Palette, LogOut } from 'lucide-react';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { SidebarTrialCard } from '@/components/layout/SidebarTrialCard';
import { useShop } from '@/lib/hooks/useShop';
import { useMe } from '@/lib/hooks/useMe';
import { useNavGroups, passesGate, isNavActive, ACCOUNT_ENTRIES, type NavEntry } from '@/lib/navigation';
import { useNavBadges } from '@/lib/hooks/useNavBadges';
import { confirmLeave } from '@/lib/dirtyGuard';

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
    <span className={`ms-auto min-w-5.5 h-5.5 rounded-full text-xs font-semibold flex items-center justify-center px-1.5 leading-none ${
      danger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'
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
      className={`flex w-full items-center gap-3.5 rounded-xl px-3 min-h-12 text-[0.9375rem] font-medium transition-all text-start ${
        active ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : ''}`} />
      <span className="flex-1">{t(entry.labelKey)}</span>
      {(badge ?? 0) > 0 && <BadgeDot count={badge!} danger={isDanger} />}
    </button>
  );
}

function AppearanceRow({ onNav }: { onNav: (href: string) => void }) {
  const tc = useTranslations('layout.common');
  const { close } = useBurger();
  const { toggle } = useThemeDrawer();
  function handleClick() { close(); toggle(); }
  return (
    <button onClick={handleClick}
      className="flex w-full items-center gap-3.5 rounded-xl px-3 min-h-12 text-[0.9375rem] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
      <Palette className="h-5 w-5 shrink-0" />
      <span className="flex-1">{tc('appearance')}</span>
    </button>
  );
}

function NavGroupSection({ titleKey, entries, pathname, onNav, badges }: {
  titleKey?: string; entries: NavEntry[]; pathname: string;
  onNav: (href: string) => void; badges: Record<string, number> | undefined;
}) {
  const tNav = useTranslations('layout.nav');
  return (
    <div className="flex flex-col gap-0.5">
      {titleKey && (
        <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {tNav(titleKey)}
        </div>
      )}
      {entries.map((entry) => {
        const badge = entry.badgeKey ? (badges?.[entry.badgeKey] ?? 0) : 0;
        return (
          <MenuNavItem key={entry.href} entry={entry}
            active={isNavActive(entry.href, pathname)}
            onNav={onNav} badge={badge} />
        );
      })}
    </div>
  );
}

export function BurgerMenuDrawer() {
  const tc = useTranslations('layout.common');
  const tBurger = useTranslations('layout.burgerMenu');
  const { open, close } = useBurger();
  const router   = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: shop } = useShop();
  const membership = me?.membership ?? null;
  const { data: badges } = useNavBadges();
  const navGroups = useNavGroups();

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
    if (!confirmLeave(tc('confirm_leave'))) return;
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
        className={`fixed top-0 inset-s-0 z-80 flex h-dvh flex-col bg-card shadow-xl border-e border-border overflow-y-auto transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
        style={{
          width: 'min(86vw, 21rem)',
          paddingTop: 'calc(0.875rem + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pb-4.5">
          <div className="h-9 w-9 flex-none rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0 overflow-hidden">
            {shop?.logo_url
              ? <Image src={shop.logo_url} alt={displayName} width={36} height={36} unoptimized className="h-9 w-9 object-cover" />
              : 'M'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[0.9375rem] font-semibold text-foreground leading-tight">Mizan</div>
            <div className="text-xs text-muted-foreground truncate">{displayName}</div>
          </div>
          <button onClick={close} aria-label={tc('close')}
            className="h-11 w-11 flex items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* Navigation groups */}
        <div className="flex flex-col gap-5 px-2.5">
          {filteredGroups.map((group) => (
            <NavGroupSection key={group.titleKey ?? 'main'} titleKey={group.titleKey}
              entries={group.entries} pathname={pathname} onNav={handleNav} badges={badges} />
          ))}

          {/* Account section */}
          <div className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {tBurger('account_section')}
            </div>
            {accountEntries.map((entry) => (
              <MenuNavItem key={entry.href} entry={entry}
                active={isNavActive(entry.href, pathname)}
                onNav={handleNav} />
            ))}
            <AppearanceRow onNav={handleNav} />
          </div>

          {/* Language */}
          <div className="px-1">
            <div className="text-[0.8125rem] font-medium text-muted-foreground mb-1.5">{tc('language')}</div>
            <LanguageSwitcher />
          </div>
        </div>

        {/* Bottom section: trial + logout */}
        <div className="mt-auto flex flex-col gap-2 pt-5 px-2.5">
          <SidebarTrialCard />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3.5 rounded-xl px-3 min-h-12 text-[0.9375rem] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {tc('logout')}
          </button>
        </div>
      </aside>
    </>
  );
}
