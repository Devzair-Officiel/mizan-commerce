'use client';

import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SheetActionsProps {
  formId: string;
  submitLabel: string;
  onCancel: () => void;
  /** Ligne existante : suppression à gauche des actions. */
  onDelete?: () => void;
  deleteLabel?: string;
}

/** Pied des feuilles de saisie de l'assistant : supprimer (ligne existante), annuler, valider. */
export function SheetActions({ formId, submitLabel, onCancel, onDelete, deleteLabel }: SheetActionsProps) {
  const t = useTranslations('zakat.common');
  return (
    <div className="flex items-center justify-end gap-2">
      {onDelete && (
        <Button type="button" variant="ghost" onClick={onDelete} aria-label={deleteLabel}
          className="me-auto size-11 rounded-full text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-400">
          <Trash2 className="size-4" aria-hidden />
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onCancel} className="h-11 rounded-full px-4">{t('cancel')}</Button>
      <Button type="submit" form={formId} className="h-11 flex-1 rounded-full px-5 font-semibold lg:flex-none">{submitLabel}</Button>
    </div>
  );
}
