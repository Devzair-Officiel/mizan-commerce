'use client';

import { Check, CloudOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SaveStatus as Status } from './useZakatAutosave';

/**
 * État de l'enregistrement automatique, dans la barre du haut. Mobile : l'icône seule (le texte reste lu
 * par les lecteurs d'écran), sauf en cas d'échec où « Réessayer » s'affiche.
 */
export function SaveStatus({ status, onRetry }: { status: Status; onRetry: () => void }) {
  const t = useTranslations('zakat.common');

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-2 text-[0.8125rem] whitespace-nowrap text-red-700 dark:text-red-400" role="alert">
        <CloudOff className="size-4 shrink-0" aria-hidden />
        <span className="max-lg:sr-only">{t('save_error')}</span>
        <button type="button" onClick={onRetry} className="min-h-11 rounded-full px-2 font-semibold whitespace-nowrap underline underline-offset-2 active:scale-[0.98]">
          {t('retry')}
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[0.8125rem] whitespace-nowrap text-muted-foreground" aria-live="polite">
      {status === 'saving'
        ? <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
        : <Check className="size-4 shrink-0 text-green-700 dark:text-green-400" aria-hidden />}
      <span className="max-lg:sr-only">{t(status === 'saving' ? 'saving' : 'saved')}</span>
    </span>
  );
}
