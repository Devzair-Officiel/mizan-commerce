'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useDowngradeToFree } from '@/lib/hooks/useSubscription';

/** Résiliation, discrète en bas de page : retour immédiat sur Découverte, après confirmation. */
export function CancelPlan() {
  const t = useTranslations('settings.subscription');
  const downgrade = useDowngradeToFree();
  const [open, setOpen] = useState(false);

  async function confirm() {
    try {
      await downgrade.mutateAsync();
    } catch {
      throw new Error(t('cancel_error'));
    }
  }

  return (
    <section className="flex flex-col items-start gap-1 border-t border-border pt-4">
      <button type="button" onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]">
        {t('cancel_cta')}
      </button>
      <p className="text-xs text-muted-foreground">{t('cancel_hint')}</p>
      <ConfirmDialog open={open} onOpenChange={setOpen} variant="destructive" onConfirm={confirm}
        title={t('cancel_title')} description={t('cancel_text')} confirmLabel={t('cancel_confirm')} cancelLabel={t('cancel_back')} />
    </section>
  );
}
