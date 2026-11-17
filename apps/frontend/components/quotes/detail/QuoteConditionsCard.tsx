'use client';

import { useTranslations } from 'next-intl';
import { DetailRow } from '@/components/detail/DetailRow';
import { SectionCard } from '@/components/ui/SectionCard';
import type { Quote } from '@/lib/hooks/useQuotes';

/** Conditions : durée de validité et délai de paiement, figés à l'envoi. */
export function QuoteConditionsCard({ quote }: { quote: Quote }) {
  const t = useTranslations('quotes.detail');
  const days = quote.payment_terms_days;
  const terms = days === null ? 'none' : days === 0 ? 'receipt' : 'days';
  return <SectionCard title={t('conditions_title')}>
    <dl className="divide-y divide-border">
      <DetailRow label={t('conditions_validity')}>{t('conditions_validity_value', { days: quote.validity_days })}</DetailRow>
      <DetailRow label={t('conditions_payment')}>{t('conditions_payment_value', { terms, days: days ?? 0 })}</DetailRow>
    </dl>
  </SectionCard>;
}
