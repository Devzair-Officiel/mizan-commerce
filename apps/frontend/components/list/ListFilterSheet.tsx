'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';

interface ListFilterSheetProps {
  open: boolean;
  onClose: () => void;
  /** Sections `FilterSheetSection`, dans l'ordre : filtres puis « Trier par ». */
  children: ReactNode;
  /** Remet le brouillon à zéro (filtres seulement, le tri est gardé). */
  onReset: () => void;
  resetDisabled: boolean;
  /** « Voir les 12 commandes » : nombre de résultats du brouillon. */
  applyLabel: string;
  onApply: () => void;
}

/**
 * Fenêtre Filtres d'une page de liste (mobile). Les choix restent un brouillon
 * tenu par la page : rien ne s'applique avant « Voir les N … », qui ferme.
 */
export function ListFilterSheet({
  open, onClose, children, onReset, resetDisabled, applyLabel, onApply,
}: ListFilterSheetProps) {
  const t = useTranslations('ui.list');
  return (
    <BottomSheet open={open} onClose={onClose} title={t('filters')} footer={
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onReset} disabled={resetDisabled}
          className="h-12 rounded-full px-4 text-sm font-semibold text-primary">
          {t('reset')}
        </Button>
        <Button onClick={onApply} className="h-12 flex-1 rounded-full text-sm font-semibold">
          {applyLabel}
        </Button>
      </div>
    }>
      <div className="-mx-2 flex flex-col gap-5">{children}</div>
    </BottomSheet>
  );
}
