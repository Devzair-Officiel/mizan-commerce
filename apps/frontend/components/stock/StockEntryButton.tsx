'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface StockEntryButtonProps {
  /** Nom complet du format, pour le libellé accessible (« Entrée de stock, Sandales, Pointure 41 »). */
  label: string;
  onClick: () => void;
}

/** Bouton « + Entrée » d'une ligne de stock : ouvre l'entrée rapide du format. */
export function StockEntryButton({ label, onClick }: StockEntryButtonProps) {
  const t = useTranslations('stock.levels');
  return (
    <button type="button" onClick={onClick} aria-label={t('entry_for', { name: label })}
      className="inline-flex h-8.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Plus size={14} aria-hidden />
      {t('entry_short')}
    </button>
  );
}
