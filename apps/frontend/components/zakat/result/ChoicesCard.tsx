'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { ChoiceRows } from './ChoiceRows';
import type { ChoiceSummaryRow } from './useChoiceSummary';

interface ChoicesCardProps {
  calc: ZakatCalculation;
  rows: ChoiceSummaryRow[];
  onGo: (step: number) => void;
}

/** Desktop, colonne de droite : les choix d'avis de la fiche, modifiables à tout moment (Q6). */
export function ChoicesCard({ calc, rows, onGo }: ChoicesCardProps) {
  const t = useTranslations('zakat');
  return (
    <div className="max-lg:hidden">
      <SectionCard title={t('result.choices_title')} description={t(calc.review.is_latest ? 'choice.note_latest' : 'choice.note')}>
        <ChoiceRows id={calc.id} rows={rows} onGo={onGo} />
      </SectionCard>
    </div>
  );
}
