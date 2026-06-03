'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sun, Moon, Palette } from 'lucide-react';
import { useThemeDrawer } from '@/components/layout/ThemeDrawer';

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
  const { toggle } = useBurger();
  return (
    <button onClick={toggle} aria-label="Menu" className="flex h-8 w-8 flex-col items-center justify-center gap-1.5">
      <span className="h-0.5 w-5 rounded-full bg-foreground transition-all" />
      <span className="h-0.5 w-5 rounded-full bg-foreground transition-all" />
      <span className="h-0.5 w-3.5 rounded-full bg-foreground transition-all" />
    </button>
  );
}

/* ── Drawer ── */
const MENU_ITEMS = [
  { href: '/stock/add',  label: 'Entrée stock',        icon: BoxInIcon },
  { href: '/stock/out',  label: 'Sortie stock',         icon: BoxOutIcon },
  { href: '/reminders',  label: 'Rappels',              icon: BellIcon },
  { href: '/notes',      label: 'Notes',                icon: NoteIcon },
  { href: '/zakat',      label: 'Zakat',                icon: ZakatIcon },
  { href: '/profile',    label: 'Mon profil',           icon: ProfileIcon },
  { href: '/settings',   label: 'Paramètres boutique',  icon: SettingsIcon },
];

export function BurgerMenuDrawer() {
  const { open, close } = useBurger();
  const router   = useRouter();
  const pathname = usePathname();

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

      {/* Panneau */}
      <aside
        className={`fixed inset-y-0 left-0 z-80 flex w-72 flex-col shadow-2xl backdrop-blur-sm transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'color-mix(in oklch, var(--primary) 78%, transparent)' }}
      >
        {/* En-tête */}
        <div className="flex h-16 items-center justify-between px-5 pt-2">
          <span className="text-xl font-bold text-white">Mizan</span>
          <button onClick={close} aria-label="Fermer" className="text-white/70 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <div className="flex flex-col gap-0.5">
            {MENU_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <button
                  key={href}
                  onClick={() => handleNav(href)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium transition-all text-left ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/15'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-[19px]">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Thème + Déconnexion */}
        <div className="p-3 pb-8 flex flex-col gap-0.5 border-t border-white/15">
          <AppearanceRow />
          <ThemeToggleRow />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-medium text-white/75 hover:text-white hover:bg-white/15 transition-all"
          >
            <LogoutIcon className="h-5 w-5 shrink-0" />
            Se déconnecter
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── Apparence (ouvre le ThemeDrawer) ── */
function AppearanceRow() {
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
      Apparence
    </button>
  );
}

/* ── Bascule de thème (intégrée au drawer) ── */
function ThemeToggleRow() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-medium text-white/75 hover:text-white hover:bg-white/15 transition-all"
    >
      {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
      Mode {isDark ? 'clair' : 'sombre'}
    </button>
  );
}

/* ── Icônes ── */
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
