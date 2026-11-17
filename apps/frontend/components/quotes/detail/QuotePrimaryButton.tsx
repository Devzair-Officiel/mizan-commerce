'use client';

import { useTranslations } from 'next-intl';
import { DetailPrimaryButton } from '@/components/detail/DetailPrimaryButton';
import { PdfButton } from '@/components/detail/PdfButton';
import type { DetailAction } from '@/components/detail/types';
import type { Quote } from '@/lib/hooks/useQuotes';
import { quotePdfHref } from './useQuoteActions';

/** L'action principale ; sans elle (refusé, expiré), le PDF prend sa place. En-tête desktop ou barre mobile. */
export function QuotePrimaryButton({ quote, primary, className }: { quote: Quote; primary: DetailAction | null; className?: string }) {
  const t = useTranslations('quotes.actions');
  return primary
    ? <DetailPrimaryButton action={primary} className={className} />
    : <PdfButton href={quotePdfHref(quote)} label={t('pdf')} className={className} />;
}
