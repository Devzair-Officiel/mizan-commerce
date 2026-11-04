'use client';

import { useTranslations } from 'next-intl';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Skeleton } from '@/components/ui/skeleton';
import type { useCreditNotePreview } from '@/lib/hooks/useCreditNotes';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { TotalsCard } from '../detail/TotalsCard';

interface CreditNotePreviewCardProps {
  invoice: Invoice;
  preview: ReturnType<typeof useCreditNotePreview>;
}

const REFUSALS = ['over_credit', 'nothing_to_credit', 'invoice_draft', 'invoice_cancelled', 'credit_note_of_credit_note'];

/** Montants de l'avoir tels que le serveur les calculera ; atténués tant qu'un réglage attend son aperçu. */
export function CreditNotePreviewCard({ invoice, preview }: CreditNotePreviewCardProps) {
  const t = useTranslations('invoices.credit');
  const { data, isError, refetch, settling } = preview;
  if (!data && isError) return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3">
    <p className="text-sm text-red-700 dark:text-red-400">{t('preview_error')}</p>
    <Button type="button" variant="outline" className="h-11 rounded-full" onClick={() => refetch()}>{t('retry')}</Button>
  </div>;
  if (!data) return <LoadingRegion className="flex flex-col gap-2 rounded-2xl border border-border p-4">
    <Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-5 w-full" />
  </LoadingRegion>;
  const [refusal] = data.refusals;
  if (refusal) return <p role="status" className="flex items-start gap-2 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
    <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
    {t('error', { code: REFUSALS.includes(refusal) ? refusal : 'other' })}
  </p>;
  if (!data.totals) return null;
  return <div aria-busy={settling} aria-live="polite" className={`transition-opacity ${settling ? 'opacity-60' : ''}`}>
    <TotalsCard document={{ ...data.totals, currency: invoice.currency, tax_rate: invoice.tax_rate, presentation: invoice.presentation }}
      title={t('preview')} negative />
  </div>;
}
