'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';
import { CalcLine } from './CalcLine';
import { useResultLines } from './useResultLines';

interface ResultLinesProps {
  calc: ZakatCalculation;
  format: ZakatFormat;
  onGo: (step: number) => void;
}

/** « Le calcul » : d'où vient chaque montant, jusqu'à la zakat estimée. */
export function ResultLines({ calc, format, onGo }: ResultLinesProps) {
  const t = useTranslations('zakat.result');
  const lines = useResultLines(calc, format);
  return (
    <SectionCard title={t('lines_title')} description={(
      <>
        <span className="max-lg:hidden">{t('lines_hint')}</span>
        <span className="lg:hidden">{t('lines_hint_short')}</span>
      </>
    )}>
      <ul>
        {lines.map((line) => <CalcLine key={line.key} line={line} id={calc.id} onGo={onGo} />)}
      </ul>
    </SectionCard>
  );
}
