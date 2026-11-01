'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { DetailRow } from '@/components/detail/DetailRow';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { NegativeAmount } from '../shared/NegativeAmount';

type TotalsDocument = Pick<Invoice, 'currency' | 'subtotal_ht' | 'discount_amount' | 'shipping_amount' | 'tax_rate' | 'tax_amount' | 'total_ttc'>
  & { presentation?: Pick<NonNullable<Invoice['presentation']>, 'vat_regime'> };

interface TotalsCardProps {
  document: TotalsDocument;
  title: string;
  rightSlot?: ReactNode;
  /** Avoir : montants enregistrés positifs, affichés négatifs (remise en positif, comme le PDF). */
  negative?: boolean;
  /** Lignes ajoutées après le total TTC (règlement d'une facture), dans le même `<dl>`. */
  children?: ReactNode;
}

/** Sous-total HT, remise, port, TVA et total TTC d'une facture, d'un devis ou d'un avoir. */
export function TotalsCard({ document: d, title, rightSlot, negative, children }: TotalsCardProps) {
  const t = useTranslations('invoices.totals');
  const money = useFormatMoney();
  const m = (value: string | number) => negative ? <NegativeAmount value={value} currency={d.currency} /> : money(value, d.currency);
  const vat = Number(d.tax_rate) > 0 || d.presentation?.vat_regime === 'applicable';
  return <SectionCard title={title} rightSlot={rightSlot} wrap>
    <dl className="divide-y divide-border">
      <DetailRow label={t('subtotal')}>{m(d.subtotal_ht)}</DetailRow>
      {Number(d.discount_amount) > 0 && <DetailRow label={t('discount')}>{negative ? money(d.discount_amount, d.currency) : <span dir="ltr">{`− ${money(d.discount_amount, d.currency)}`}</span>}</DetailRow>}
      {Number(d.shipping_amount) > 0 && <DetailRow label={t('shipping')}>{m(d.shipping_amount)}</DetailRow>}
      <DetailRow label={vat ? t('tax_rate', { rate: Number(d.tax_rate) }) : t('tax')}>{vat ? m(d.tax_amount) : t('not_applicable')}</DetailRow>
      <DetailRow label={t('total')} className="text-base">{m(d.total_ttc)}</DetailRow>
      {children}
    </dl>
  </SectionCard>;
}
