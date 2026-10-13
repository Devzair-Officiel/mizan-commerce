'use client';

import { useTranslations } from 'next-intl';
import { Plus, Check, Loader2 } from 'lucide-react';

const BASE = 'shrink-0 w-16 h-9 rounded-full flex items-center justify-center';

/** Bouton d'ajout d'une ligne du catalogue : « + », chargement, ou quantité déjà au ticket. */
export function DesktopAddButton({ name, qty, onClick, isLoading }: {
  name: string; qty: number; onClick: () => void; isLoading?: boolean;
}) {
  const t = useTranslations('orders.picker');
  if (isLoading) {
    return (
      <button type="button" disabled className={`${BASE} border border-border text-muted-foreground`}>
        <Loader2 size={14} className="animate-spin" />
      </button>
    );
  }
  if (qty > 0) {
    return (
      <button type="button" onClick={onClick} aria-label={t('add_aria', { name })}
        className={`${BASE} bg-secondary text-secondary-foreground gap-1 text-xs font-semibold`}>
        <Check size={13} strokeWidth={2.5} />{qty}
      </button>
    );
  }
  return (
    <button type="button" aria-label={t('add_aria', { name })} onClick={onClick}
      className={`${BASE} border border-border text-primary hover:bg-primary/5 transition-colors`}>
      <Plus size={18} strokeWidth={2} />
    </button>
  );
}
