'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FORM_COLUMNS } from '@/components/form/fieldStyles';
import { BasisLink } from '../basis/BasisLink';
import type { StepProps } from '../steps/types';
import { ChoicesCard } from './ChoicesCard';
import { ForgotSheet } from './ForgotSheet';
import { MobileSummaryCard } from './MobileSummaryCard';
import { OutsideCard } from './OutsideCard';
import { ResultActions } from './ResultActions';
import { ResultHero } from './ResultHero';
import { ResultLines } from './ResultLines';
import { useChoiceSummary } from './useChoiceSummary';

interface ResultViewProps extends StepProps {
  onGo: (step: number) => void;
  onPrevious: () => void;
}

/** Étape 7, jamais figée : le verdict, le calcul ligne par ligne (chaque ligne ouvre son étape), hors base et vos choix. */
export function ResultView({ calc, format, onGo, onPrevious }: ResultViewProps) {
  const t = useTranslations('zakat');
  const [forgot, setForgot] = useState(false);
  const rows = useChoiceSummary(calc, format);

  return (
    <div className={FORM_COLUMNS}>
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
        <ResultHero calc={calc} format={format} onGo={onGo} />
        <ResultLines calc={calc} format={format} onGo={onGo} />
        <OutsideCard calc={calc} format={format} />
        <ResultActions id={calc.id} onPrevious={onPrevious} onForgot={() => setForgot(true)} />
        <p className="text-[0.8125rem] leading-normal text-muted-foreground max-lg:hidden">{t('result.saved_note')}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
        <ChoicesCard calc={calc} rows={rows} onGo={onGo} />
        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 max-lg:hidden">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">{t('result.recipients_title')}</h2>
          <p className="text-[0.8125rem] leading-normal text-muted-foreground">{t('result.recipients_text')}</p>
          <BasisLink view="recipients" label={t('basis.see_categories')} icon={false} className="min-h-6 text-[0.84375rem]" />
        </section>
        <MobileSummaryCard calc={calc} rows={rows} format={format} onGo={onGo} />
        <p className="text-xs leading-normal text-muted-foreground lg:hidden">
          {t('result.saved_note')} {t('common.estimate_footer')}
        </p>
      </div>
      <p className="mt-2 max-w-prose text-[0.78125rem] leading-normal text-muted-foreground max-lg:hidden lg:col-span-2">
        {t('common.estimate_footer')}
      </p>
      {forgot && <ForgotSheet id={calc.id} onGo={onGo} onClose={() => setForgot(false)} />}
    </div>
  );
}
