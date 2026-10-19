'use client';

import { useTranslations } from 'next-intl';
import { toDateInput } from '@/components/reminders/reminderDates';
import { useShopTimeZone } from '@/lib/hooks/useShop';
import type { FollowUpItem } from '@/lib/hooks/useZakatFollowUps';
import type { ZakatFormat } from '../useZakatFormat';
import { DateAmountSheet } from './DateAmountSheet';
import type { RunFollowUp } from './useFollowUpRun';

interface CollectedSheetProps {
  item: FollowUpItem;
  /** Jour J de la fiche d'origine (une créance saisie à la main n'a que la sienne). */
  referenceDate: string;
  format: ZakatFormat;
  run: RunFollowUp;
  onClose: () => void;
}

/** « Encaissée » : quand et combien, entre le jour J et aujourd'hui, au plus le montant de la créance. */
export function CollectedSheet({ item, referenceDate, format, run, onClose }: CollectedSheetProps) {
  const t = useTranslations('zakat.followup.collected_sheet');
  const timeZone = useShopTimeZone();
  const today = toDateInput(new Date(), timeZone);
  return (
    <DateAmountSheet title={t('title')} description={t('hint', { label: item.label })}
      labels={{ date: t('date'), amount: t('amount'), submit: t('submit') }}
      defaults={{ date: today, amount: item.amount }} minDate={referenceDate} maxDate={today} maxAmount={item.amount}
      format={format} onClose={onClose}
      onSubmit={(values) => run(item, { action: 'collected', collected_on: values.date, amount: values.amount }, onClose)} />
  );
}
