'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

interface ThemeDrawerCtx { open: boolean; toggle: () => void; close: () => void; }
const Ctx = createContext<ThemeDrawerCtx>({ open: false, toggle: () => {}, close: () => {} });
export function useThemeDrawer() { return useContext(Ctx); }

export function ThemeDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close  = useCallback(() => setOpen(false), []);
  return <Ctx.Provider value={{ open, toggle, close }}>{children}</Ctx.Provider>;
}


export function ThemeDrawerPanel() {
  const t = useTranslations('layout.themeDrawer');
  const tc = useTranslations('layout.common');
  const { open, close } = useThemeDrawer();

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        className={`fixed inset-0 z-70 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panneau côté "end" (droite en LTR, gauche en RTL).
          Tailwind ne flippe pas translateX automatiquement → variant explicite. */}
      <aside
        className={`fixed inset-y-0 inset-e-0 z-80 flex w-80 flex-col bg-card shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full'
        }`}
      >
        {/* En-tête */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-border shrink-0">
          <div>
            <p className="font-bold text-base text-foreground">{t('title')}</p>
            <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
          </div>
          <button
            onClick={close}
            aria-label={tc('close')}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}

