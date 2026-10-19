'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { useCalculationFollowUps, type FollowUpItem } from '@/lib/hooks/useZakatFollowUps';
import { CollectedSheet } from '../followup/CollectedSheet';
import { FollowUpRow } from '../followup/FollowUpRow';
import { useFollowUpRun } from '../followup/useFollowUpRun';
import type { ZakatFormat } from '../useZakatFormat';

/** État de chaque créance différée de la fiche, une fois son jour J passé ; rien avant. */
export function FollowUpsCard({ calc, format }: { calc: ZakatCalculation; format: ZakatFormat }) {
  const t = useTranslations('zakat.followup');
  const { data: items } = useCalculationFollowUps(calc.id);
  const { run, pending } = useFollowUpRun();
  const [collecting, setCollecting] = useState<FollowUpItem | null>(null);
  if (!items || items.length === 0) return null;

  return (
    <SectionCard title={t('result_title')} description={t('result_hint')}>
      <ul>
        {items.map((item) => (
          <FollowUpRow key={`${item.calculation_id}:${item.line_id}`} item={item} run={run} pending={pending} full onCollect={() => setCollecting(item)} />
        ))}
      </ul>
      {collecting && (
        <CollectedSheet item={collecting} referenceDate={calc.reference_date} format={format} run={run} onClose={() => setCollecting(null)} />
      )}
    </SectionCard>
  );
}
