'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { compareDecimal, isZeroDecimal, normalizeDecimal } from '@/lib/decimal';
import type { ZakatFormat } from '../useZakatFormat';
import { AmountField } from './AmountField';

const SHARE_PATTERN = /^\d{1,3}(?:[.,]\d{1,2})?$/;

/** Entre 0,01 et 100 : la limite que le serveur vérifie aussi. */
function validShare(value: string): boolean {
  if (!SHARE_PATTERN.test(value)) return false;
  const share = normalizeDecimal(value);
  return !isZeroDecimal(share) && compareDecimal(share, '100') <= 0;
}

interface ShareCardProps {
  share: string | null;
  format: ZakatFormat;
  onSave: (share: string) => void;
}

/** Part de la boutique détenue : chaque associé verse sur sa part. */
export function ShareCard({ share, format, onSave }: ShareCardProps) {
  const t = useTranslations('zakat.steps.hawl');
  return (
    <SectionCard title={t('share_title')} description={t('share_hint')}>
      <div className="p-5">
        <AmountField label={t('share_label')} suffix="%" placeholder="100"
          initial={format.amountInput(share ?? '100').replace(/[.,]00$/, '')}
          pattern={{ test: validShare, message: t('share_invalid') }}
          onSave={onSave} />
      </div>
    </SectionCard>
  );
}
