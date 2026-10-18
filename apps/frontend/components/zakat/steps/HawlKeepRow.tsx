'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { useUpdateZakatProfile, useZakatProfile, type ZakatCalculation } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';

/**
 * Jour J habituel (profil). Il ne suit pas la fiche tout seul (Q5) : si la fiche la plus récente tombe
 * un autre jour, un geste le reprend pour les années suivantes.
 */
export function HawlKeepRow({ calc, format }: { calc: ZakatCalculation; format: ZakatFormat }) {
  const t = useTranslations('zakat.steps.hawl');
  const tc = useTranslations('zakat.common');
  const { data: profile } = useZakatProfile();
  const update = useUpdateZakatProfile();
  if (!profile) return null;

  function keep() {
    update.mutate({ hawl_date: calc.reference_date }, {
      onSuccess: () => notify.success(t('keep_done')),
      onError: () => notify.error(tc('save_failed')),
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-4">
      <p className="text-[0.8125rem] text-muted-foreground">
        {profile.hawl_date ? t('usual', { date: format.date(profile.hawl_date) }) : t('usual_none')}
      </p>
      {calc.review.hawl_date_differs && (
        <Button type="button" variant="outline" onClick={keep} disabled={update.isPending}
          className="h-11 rounded-full px-4 text-[0.8125rem] font-semibold whitespace-normal lg:h-9">
          {t('keep')}
        </Button>
      )}
    </div>
  );
}
