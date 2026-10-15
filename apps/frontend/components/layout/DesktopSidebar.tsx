'use client';

import { AppMenu } from './AppMenu';

/** Menu desktop : même organisation et même design que le menu burger, à plat (pas de sous-menu). */
export function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 fixed inset-y-0 inset-s-0 z-30 overflow-y-auto border-e border-border bg-background">
      <AppMenu desktop />
    </aside>
  );
}
