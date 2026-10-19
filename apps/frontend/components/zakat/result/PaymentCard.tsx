'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toDateInput } from '@/components/reminders/reminderDates';
import { Button } from '@/components/ui/button';
import { compareDecimal } from '@/lib/decimal';
import { notify } from '@/lib/notify';
import { useShopTimeZone } from '@/lib/hooks/useShop';
import { isVersionConflict, useZakatPayment, type ZakatCalculation, type ZakatPayment } from '@/lib/hooks/useZakat';
import { DateAmountSheet } from '../followup/DateAmountSheet';
import type { ZakatFormat } from '../useZakatFormat';

/**
 * « Marquer comme versée » pour la zakat de la fiche : date et montant modifiables (versé en
 * plusieurs fois, arrondi). Montant de la fiche changé ensuite : les deux montants restent visibles.
 */
export function PaymentCard({ calc, format }: { calc: ZakatCalculation; format: ZakatFormat }) {
  const t = useTranslations('zakat.payment');
  const timeZone = useShopTimeZone();
  const today = toDateInput(new Date(), timeZone);
  const [editing, setEditing] = useState(false);
  const { mutate, isPending } = useZakatPayment(calc.id);
  const due = calc.totals.zakat_now;
  const paid = calc.paid_on && calc.paid_amount ? { on: calc.paid_on, amount: calc.paid_amount } : null;
  if (!paid && (due === null || compareDecimal(due, '0') <= 0)) return null;

  function save(payment: ZakatPayment | null, done: string) {
    if (isPending) return;
    mutate({ payment, version: calc.version }, {
      onSuccess: () => { setEditing(false); notify.success(t(done)); },
      onError: (error) => notify.error(t(isVersionConflict(error) ? 'conflict' : 'failed')),
    });
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-[0.9375rem] font-semibold text-foreground">{t('title')}</h2>
      {paid ? (
        <div className="flex flex-col gap-0.5 text-[0.8125rem] leading-snug text-muted-foreground tabular-nums">
          <p className="text-sm font-semibold text-foreground">{t('paid', { date: format.date(paid.on), amount: format.money(paid.amount) })}</p>
          {due !== null && compareDecimal(due, paid.amount) !== 0 && <p>{t('due_now', { amount: format.money(due) })}</p>}
        </div>
      ) : (
        <p className="text-[0.8125rem] leading-normal text-muted-foreground">{t('hint')}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant={paid ? 'outline' : 'default'} disabled={isPending} onClick={() => setEditing(true)} aria-haspopup="dialog"
          className="h-11 rounded-full px-5 font-semibold">{t(paid ? 'edit' : 'mark')}</Button>
        {paid && (
          <p className="text-[0.8125rem] text-muted-foreground">
            {t('mistake')}{' '}
            <button type="button" disabled={isPending} onClick={() => save(null, 'done_reverted')} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline disabled:opacity-50">{t('revert')}</button>
          </p>
        )}
      </div>
      {editing && (
        <DateAmountSheet title={t(paid ? 'sheet_edit' : 'sheet_title')} description={t('sheet_hint')}
          labels={{ date: t('date'), amount: t('amount'), submit: t('submit') }}
          defaults={paid ? { date: paid.on, amount: paid.amount } : { date: today, amount: due ?? '0' }} maxDate={today}
          format={format} onClose={() => setEditing(false)}
          onSubmit={(values) => save({ paid_on: values.date, paid_amount: values.amount }, paid ? 'done_changed' : 'done_paid')} />
      )}
    </section>
  );
}
