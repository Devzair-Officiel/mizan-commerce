'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** « Retirer la ligne » : bouton rond discret en fin de ligne. */
export function EntryRemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  const t = useTranslations('stock.entry');
  return (
    <button type="button" onClick={onClick} aria-label={t('remove_line', { label })}
      className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <X size={16} aria-hidden />
    </button>
  );
}
