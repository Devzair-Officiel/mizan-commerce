'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';

interface FormActionsProps {
  /** Le formulaire diffère de ce qui est enregistré. */
  dirty: boolean;
  submitting: boolean;
  submitLabel: string;
  /** En modification : désactivé tant que rien n'a changé. */
  submitDisabled?: boolean;
  /** Retour sans enregistrer (la page applique la garde « quitter sans enregistrer »). */
  onCancel: () => void;
}

/**
 * Desktop : sous la carte, sans cadre ni fond — état à gauche, « Annuler » et bouton principal à droite.
 * Mobile : bouton principal flottant au-dessus de la barre du bas. À placer dans le `<form>`.
 */
export function FormActions({ dirty, submitting, submitLabel, submitDisabled, onCancel }: FormActionsProps) {
  const t = useTranslations('ui.form');
  const label = submitting ? t('saving') : submitLabel;
  const disabled = submitting || submitDisabled;

  return (
    <>
      <div className="hidden flex-wrap items-center justify-between gap-3 px-1 lg:flex">
        <p className="text-[0.8125rem] text-muted-foreground" aria-live="polite">
          {dirty && (
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden />
              {t('unsaved')}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" onClick={onCancel} className="h-10 rounded-full px-4 text-sm font-medium">
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={disabled} className="h-10 rounded-full px-5 text-sm font-semibold">
            {label}
          </Button>
        </div>
      </div>
      <FloatingActionBar variant="button">
        <Button type="submit" disabled={disabled} className="h-12 w-full rounded-full text-sm font-semibold shadow-lg">
          {label}
        </Button>
      </FloatingActionBar>
    </>
  );
}
