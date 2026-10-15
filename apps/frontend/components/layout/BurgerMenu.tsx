'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useScrollLock } from '@base-ui/utils/useScrollLock';
import { AppMenu } from '@/components/layout/AppMenu';

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

/* ── Drawer ── */
export function BurgerMenuDrawer() {
  const tc = useTranslations('layout.common');
  const { open, close } = useBurger();

  useScrollLock(open);

  return (
    <>
      <div onClick={close} className={`fixed inset-0 z-70 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} />
      <aside
        role="dialog" aria-modal={open ? true : undefined} aria-hidden={!open} aria-label={tc('menu')}
        className={`fixed top-0 inset-s-0 z-80 flex h-dvh flex-col bg-background border-e border-border shadow-xl overflow-y-auto transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'}`}
        style={{ width: 'min(88%, 21.5rem)' }}
      >
        <AppMenu onClose={close} />
      </aside>
    </>
  );
}
