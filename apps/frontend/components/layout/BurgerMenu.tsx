'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode, type ComponentType } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import {
  Sun,
  Moon,
  Palette,
  Bell,
  StickyNote,
  Coins,
  User,
  Settings,
  LogOut,
  Receipt,
} from 'lucide-react';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useShop } from '@/lib/hooks/useShop';
import { useIsClient } from '@/lib/hooks/useIsClient';
import { useMe, type ModuleKey } from '@/lib/hooks/useMe';

type NavKey = 'invoices' | 'reminders' | 'notes' | 'zakat' | 'profile' | 'settings';

type Gate = { kind: 'module'; module: ModuleKey } | { kind: 'admin' };

/* ── Contexte ── */
interface BurgerCtx { open: boolean; toggle: () => void; close: () => void; }
const Ctx = createContext<BurgerCtx>({ open: false, toggle: () => {}, close: () => {} });
export function useBurger() { return useContext(Ctx); }

export function BurgerMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close  = useCallback(() => setOpen(false), []);
  return <Ctx.Provider value={{ open, toggle, close }}>{children}</Ctx.Provider>;
}

/* ── Bouton burger (utilisé dans TopBar) ── */
export function BurgerButton() {
  const tc = useTranslations('layout.common');
  const { toggle } = useBurger();
  return (
    <button onClick={toggle} aria-label={tc('menu')} className="flex h-8 w-8 flex-col items-center justify-center gap-1.5">
      <span className="h-0.5 w-5 rounded-full bg-foreground transition-all" />
      <span className="h-0.5 w-5 rounded-full bg-foreground transition-all" />
      <span className="h-0.5 w-3.5 rounded-full bg-foreground transition-all" />
    </button>
  );
}

/* ── Drawer ── */
interface MenuItem {
  href: string;
  labelKey: NavKey;
  icon: ComponentType<{ className?: string }>;
  gate?: Gate;
}

interface MenuSection {
  titleKey: 'activity_section' | 'account_section';
  items: MenuItem[];
}

const MENU_SECTIONS: MenuSection[] = [
  {
    titleKey: 'activity_section',
    items: [
      { href: '/invoices',  labelKey: 'invoices',  icon: Receipt,     gate: { kind: 'module', module: 'invoices' } },
      { href: '/reminders', labelKey: 'reminders', icon: Bell },
      { href: '/notes',     labelKey: 'notes',     icon: StickyNote },
      { href: '/zakat',     labelKey: 'zakat',     icon: Coins,       gate: { kind: 'admin' } },
    ],
  },
  {
    titleKey: 'account_section',
    items: [
      { href: '/profile',  labelKey: 'profile',  icon: User },
      { href: '/settings', labelKey: 'settings', icon: Settings, gate: { kind: 'admin' } },
    ],
  },
];

function passesGate(gate: Gate | undefined, membership: { is_admin: boolean; permissions: ModuleKey[] } | null): boolean {
  if (!gate) return true;
  if (!membership) return false;
  if (gate.kind === 'admin') return membership.is_admin;
  if (membership.is_admin) return true;
  return membership.permissions.includes(gate.module);
}

export function BurgerMenuDrawer() {
  const tc = useTranslations('layout.common');
  const tNav = useTranslations('layout.nav');
  const tBurger = useTranslations('layout.burgerMenu');
  const { open, close } = useBurger();
  const router   = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();
  const membership = me?.membership ?? null;

  const visibleSections = MENU_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => passesGate(item.gate, membership)),
    }))
    .filter((section) => section.items.length > 0);

  // Verrouille le scroll du body tant que le drawer est ouvert : évite que la
  // barre URL de Chrome mobile se rétracte au scroll, ce qui créait un vide
  // sous le panneau (l'aside ne s'agrandissait pas avec le viewport).
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

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        className={`fixed inset-0 z-70 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panneau — h-dvh suit la barre URL mobile. En RTL, `start-0` ancre à droite
          et le translate doit s'inverser (Tailwind ne flippe pas automatiquement translateX). */}
      <aside
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-hidden={!open}
        aria-label={tc('menu')}
        className={`fixed top-0 inset-s-0 z-80 flex h-dvh w-72 flex-col shadow-2xl backdrop-blur-sm transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
        style={{ background: 'color-mix(in oklch, var(--primary) 78%, transparent)' }}
      >
        {/* En-tête */}
        <div className="flex h-16 items-center justify-between px-5 pt-2 gap-3">
          <BurgerHeader />
          <button onClick={close} aria-label={tc('close')} className="text-white/70 hover:text-white transition-colors shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-3">
          {visibleSections.map((section, idx) => (
            <div key={section.titleKey} className={idx === 0 ? '' : 'mt-4'}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                {tBurger(section.titleKey)}
              </div>
              <div className="flex flex-col gap-0.5">
                {section.items.map(({ href, labelKey, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/');
                  return (
                    <button
                      key={href}
                      onClick={() => handleNav(href)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all text-start ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'text-white/80 hover:text-white hover:bg-white/15'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="text-[17px]">{tNav(labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Langue + Thème + Déconnexion */}
        <div className="p-3 pb-8 flex flex-col gap-0.5 border-t border-white/15">
          <div className="px-1 pt-2 pb-1.5">
            <LanguageSwitcher />
          </div>
          <AppearanceRow />
          <ThemeToggleRow />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-medium text-white/75 hover:text-white hover:bg-white/15 transition-all"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {tc('logout')}
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── En-tête : logo + nom (fallback "Mizan Commerce") ── */
function BurgerHeader() {
  const tc = useTranslations('layout.common');
  const { data: shop } = useShop();
  const name = shop?.name?.trim();
  const displayName = name || tc('shop_fallback');

  return (
    <div className="flex items-center gap-3 min-w-0">
      {shop?.logo_url && (
        <Image
          src={shop.logo_url}
          alt={displayName}
          width={40}
          height={40}
          unoptimized
          className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/30 shrink-0"
        />
      )}
      <span className="text-lg font-bold text-white truncate">
        {displayName}
      </span>
    </div>
  );
}

/* ── Apparence (ouvre le ThemeDrawer) ── */
function AppearanceRow() {
  const tc = useTranslations('layout.common');
  const { close } = useBurger();
  const { toggle } = useThemeDrawer();
  function handleClick() {
    close();
    toggle();
  }
  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-medium text-white/75 hover:text-white hover:bg-white/15 transition-all"
    >
      <Palette className="h-5 w-5 shrink-0" />
      {tc('appearance')}
    </button>
  );
}

/* ── Bascule de thème (intégrée au drawer) ── */
function ThemeToggleRow() {
  const tc = useTranslations('layout.common');
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useIsClient();

  if (!mounted) return null;

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-medium text-white/75 hover:text-white hover:bg-white/15 transition-all"
    >
      {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
      {isDark ? tc('light_mode') : tc('dark_mode')}
    </button>
  );
}

