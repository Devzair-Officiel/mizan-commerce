'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { FormField } from '@/components/form/FormField';
import { SectionCard } from '@/components/ui/SectionCard';
import type { YearTaken } from '@/lib/hooks/useZakat';
import { HawlKeepRow } from './HawlKeepRow';
import type { StepProps } from './types';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function YearTakenAlert({ taken }: { taken: YearTaken }) {
  const t = useTranslations('zakat.common');
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-3.5 py-3 text-[0.84375rem] leading-normal text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        {t('year_taken', { year: String(taken.hawl_year) })}{' '}
        <Link href={`/zakat/${taken.existing_id}`} className="font-semibold underline underline-offset-2">{t('year_taken_open')}</Link>
      </p>
    </div>
  );
}

/** Jour J de la fiche : date grégorienne saisie, date hégirienne rendue par le serveur, jour J habituel (Q5). */
export function HawlDateCard({ calc, save, format, yearTaken }: StepProps & { yearTaken: YearTaken | null }) {
  const t = useTranslations('zakat.steps.hawl');
  const [date, setDate] = useState(calc.reference_date);
  const invalid = !DAY_PATTERN.test(date);

  function change(value: string) {
    setDate(value);
    if (DAY_PATTERN.test(value)) save({ reference_date: value });
  }

  return (
    <SectionCard title={t('title')} description={t('hint')}>
      <div className="flex flex-col gap-4 p-5">
        <div className="max-w-80">
          <FormField label={t('date_label')} error={invalid ? t('date_invalid') : undefined}
            help={calc.reference_hijri ? t('hijri', { date: format.hijri(calc.reference_hijri) }) : undefined}>
            {(c) => <input {...c} type="date" value={date} onChange={(e) => change(e.target.value)} className={`${FIELD_CONTROL} tabular-nums`} />}
          </FormField>
        </div>
        {yearTaken && <YearTakenAlert taken={yearTaken} />}
        <HawlKeepRow calc={calc} format={format} />
      </div>
    </SectionCard>
  );
}
