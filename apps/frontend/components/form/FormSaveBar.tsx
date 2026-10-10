'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';

interface FormSaveBarProps {
  /** Le formulaire diffère de ce qui est enregistré. */
  dirty: boolean;
  submitting: boolean;
  submitLabel: string;
  /** En modification : désactivé tant que rien n'a changé. */
  submitDisabled?: boolean;
  /** Retour sans enregistrer (la page applique la garde « quitter sans enregistrer »). */
  onCancel: () => void;
}

/** Desktop : barre collée en bas (état + Annuler + bouton principal). Mobile : bouton flottant. */
export function FormSaveBar({ dirty, submitting, submitLabel, submitDisabled, onCancel }: FormSaveBarProps) {
  const t = useTranslations('ui.form');
  const label = submitting ? t('saving') : submitLabel;
  const disabled = submitting || submitDisabled;

  return (
    <>
      <div className="sticky bottom-4 z-20 hidden items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3 shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--foreground)_25%,transparent)] lg:flex">
        <p className="flex-1 text-[0.8125rem] font-medium text-foreground" aria-live="polite">
          {dirty && (
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden />
              {t('unsaved')}
            </span>
          )}
        </p>
        <Button type="button" variant="outline" onClick={onCancel} className="h-10 rounded-full bg-card px-4 text-sm">
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={disabled} className="h-10 rounded-full px-5 text-sm font-semibold">
          {label}
        </Button>
      </div>
      <FloatingActionBar variant="button">
        <Button type="submit" disabled={disabled} className="h-12 w-full rounded-full text-sm font-semibold shadow-lg">
          {label}
        </Button>
      </FloatingActionBar>
    </>
  );
}
