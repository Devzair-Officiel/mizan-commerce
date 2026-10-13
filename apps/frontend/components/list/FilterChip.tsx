'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface FilterChipProps {
  /** Nom du filtre (« Client »), affiché avant la valeur. */
  name: string;
  value: string;
  onRemove: () => void;
}

/**
 * Filtre actif sans menu, posé par un lien (« Client : Amina ✕ ») : même
 * apparence qu'un `FilterMenuButton` actif, seule la croix agit.
 */
export function FilterChip({ name, value, onRemove }: FilterChipProps) {
  const t = useTranslations('ui.list');
  return (
    <div className="inline-flex h-10 items-center gap-2 rounded-full border border-secondary-foreground/15 bg-secondary/60 ps-3.5 text-[0.8125rem] font-medium text-foreground">
      <span className="whitespace-nowrap">
        <span className="text-muted-foreground">{t('filter_label', { name })}</span>{' '}
        <span className="font-semibold">{value}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={t('remove_filter', { name })}
        className="me-1 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
