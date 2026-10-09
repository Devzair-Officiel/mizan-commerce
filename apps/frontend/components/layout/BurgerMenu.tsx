'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Palette, LogOut } from 'lucide-react';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { MenuHeader } from '@/components/layout/MenuHeader';
import { MenuSection } from '@/components/layout/MenuSection';
import { MenuRow } from '@/components/layout/MenuRow';
import { MenuTrialCard } from '@/components/layout/MenuTrialCard';
import { useShop } from '@/lib/hooks/useShop';
import { useMe } from '@/lib/hooks/useMe';
import { useNavGroups, passesGate, isNavActive, ACCOUNT_ENTRIES, type NavGroup } from '@/lib/navigation';
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

/* ── Private helpers ── */
function NavBadge({ count, danger }: { count: number; danger?: boolean }) {
  return (
    <span className={`min-w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center px-2 leading-none shrink-0 ${
      danger ? 'bg-destructive/10 text-red-700 dark:text-red-400' : 'bg-muted text-foreground'
    }`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

function NavGroupSection({ group, pathname, onNav, badges }: {
  group: NavGroup; pathname: string; onNav: (href: string) => void;
  badges: Record<string, number> | undefined;
}) {
  const tNav = useTranslations('layout.nav');
  return (
    <MenuSection title={group.titleKey ? tNav(group.titleKey) : ''}>
      {group.entries.map((entry, i) => {
        const count = entry.badgeKey ? (badges?.[entry.badgeKey] ?? 0) : 0;
        return (
          <MenuRow
            key={entry.href}
            icon={<entry.icon className="h-4.5 w-4.5" />}
            label={tNav(entry.labelKey)}
            onClick={() => onNav(entry.href)}
            isFirst={i === 0}
            active={isNavActive(entry.href, pathname)}
            badge={count > 0 ? <NavBadge count={count} danger={entry.badgeKey === 'low_stock'} /> : undefined}
          />
        );
      })}
    </MenuSection>
  );
}

/* ── Drawer ── */
export function BurgerMenuDrawer() {
  const tc = useTranslations('layout.common');
  const tBurger = useTranslations('layout.burgerMenu');
  const tNav = useTranslations('layout.nav');
  const { open, close } = useBurger();
  const { toggle: toggleTheme } = useThemeDrawer();
  const router   = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: shop } = useShop();
  const membership = me?.membership ?? null;
  const { data: badges } = useNavBadges();
  const navGroups = useNavGroups();

  const filteredGroups = navGroups
    .map((g) => ({ ...g, entries: g.entries.filter((e) => e.href !== '/dashboard' && passesGate(e.gate, membership)) }))
    .filter((g) => g.entries.length > 0);

  const accountEntries = ACCOUNT_ENTRIES.filter((e) => passesGate(e.gate, membership));
  const roleLabels = { owner: tBurger('role_owner'), admin: tBurger('role_admin'), staff: tBurger('role_staff') };
  const roleLabel = membership?.role ? (roleLabels[membership.role] ?? '') : '';
  const subtitle = [me?.full_name, roleLabel].filter(Boolean).join(', ');
  const displayName = shop?.name?.trim() || tc('shop_fallback');

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  async function handleLogout() { close(); await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }
  function handleNav(href: string) { if (!confirmLeave(tc('confirm_leave'))) return; close(); router.push(href); }

  return (
    <>
      <div onClick={close} className={`fixed inset-0 z-70 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} />
      <aside
        role="dialog" aria-modal={open ? true : undefined} aria-hidden={!open} aria-label={tc('menu')}
        className={`fixed top-0 inset-s-0 z-80 flex h-dvh flex-col bg-background border-e border-border shadow-xl overflow-y-auto transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'}`}
        style={{ width: 'min(88%, 21.5rem)' }}
      >
        <MenuHeader logoUrl={shop?.logo_url} displayName={displayName} subtitle={subtitle} onClose={close} closeLabel={tc('close')} />
        <div className="flex flex-col gap-5.5 px-3.5 pt-4.5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
          {filteredGroups.map((group) => (
            <NavGroupSection key={group.titleKey ?? 'main'} group={group} pathname={pathname} onNav={handleNav} badges={badges} />
          ))}
          <MenuSection title={tBurger('account_section')}>
            {accountEntries.map((entry, i) => (
              <MenuRow key={entry.href} icon={<entry.icon className="h-4.5 w-4.5" />} label={tNav(entry.labelKey)} onClick={() => handleNav(entry.href)} isFirst={i === 0} active={isNavActive(entry.href, pathname)} />
            ))}
            <MenuRow icon={<Palette className="h-4.5 w-4.5" />} label={tc('appearance')} onClick={() => { close(); toggleTheme(); }} />
          </MenuSection>
          <section className="flex flex-col gap-2">
            <h2 className="m-0 px-1.5 text-sm font-bold text-foreground tracking-[-0.005em]">{tc('language')}</h2>
            <LanguageSwitcher />
          </section>
          <MenuTrialCard onNavigate={handleNav} />
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <MenuRow icon={<LogOut className="h-4.5 w-4.5" />} label={tc('logout')} onClick={handleLogout} danger isFirst />
          </div>
        </div>
      </aside>
    </>
  );
}
