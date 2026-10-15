'use client';

import { LogOut, Palette } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BrightnessToggle } from '@/components/ui/BrightnessToggle';
import { getInitials } from '@/components/customers/detail/constants';
import type { ShopRole } from '@/lib/hooks/useMe';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Pied fixe de la sidebar déployée : clair / sombre / système, langue, carte utilisateur avec Apparence et Se déconnecter. */
export function SidebarFooter({ fullName, role, onAppearance, onLogout }: {
  fullName: string | null;
  role: ShopRole | null;
  /** Ouvre le tiroir Apparence (palettes de couleurs). */
  onAppearance: () => void;
  onLogout: () => void;
}) {
  const tc = useTranslations('layout.common');
  const tTeam = useTranslations('team');

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-3">
      <BrightnessToggle compact />
      <LanguageSwitcher compact />
      <div className="flex items-center gap-1 rounded-xl ps-2 pt-1">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
          {fullName ? getInitials(fullName) : '?'}
        </span>
        <span className="ms-2 min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">{fullName ?? '—'}</span>
          {role && <span className="block truncate text-xs text-muted-foreground">{tTeam(`role.${role}`)}</span>}
        </span>
        <button type="button" onClick={onAppearance} aria-label={tc('appearance')} title={tc('appearance')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95">
          <Palette className="h-4.5 w-4.5" />
        </button>
        <button type="button" onClick={onLogout} aria-label={tc('logout')} title={tc('logout')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive active:scale-95">
          <LogOut className="h-4.5 w-4.5 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
