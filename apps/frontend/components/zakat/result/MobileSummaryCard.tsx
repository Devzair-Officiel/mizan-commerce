'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { BasisLink } from '../basis/BasisLink';
import type { ZakatFormat } from '../useZakatFormat';
import { ChoiceRows } from './ChoiceRows';
import type { ChoiceSummaryRow } from './useChoiceSummary';

interface MobileSummaryCardProps {
  calc: ZakatCalculation;
  rows: ChoiceSummaryRow[];
  format: ZakatFormat;
  onGo: (step: number) => void;
}

function SummaryRow({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p dir="auto" className="mt-0.5 text-xs text-muted-foreground">{text}</p>
      </div>
      {action}
    </li>
  );
}

/** Mobile : vos choix (détail dans une fenêtre), hors base et bénéficiaires, résumés en une carte. */
export function MobileSummaryCard({ calc, rows, format, onGo }: MobileSummaryCardProps) {
  const t = useTranslations('zakat');
  const [open, setOpen] = useState(false);
  const doubtful = calc.receivable_items.filter((item) => item.doubtful);
  const outside = [
    ...(doubtful.length > 0 ? [t('result.outside_short_doubtful', { count: doubtful.length, amount: format.money(calc.totals.receivables_doubtful) })] : []),
    ...calc.other_assets.filter((asset) => !asset.counted)
      .map((asset) => t('result.outside_short_item', { label: asset.label, amount: format.money(asset.amount) })),
    t('result.outside_short_usage'),
  ];
  const note = t('result.choices_note', { latest: String(calc.review.is_latest) });

  return (
    <>
      <ul className="overflow-hidden rounded-2xl border border-border bg-card lg:hidden">
        <SummaryRow title={t('result.choices_title')} text={rows.map((row) => row.short).join(' · ')} action={(
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
            className="min-h-11 shrink-0 px-1 text-[0.8125rem] font-semibold whitespace-nowrap text-primary outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
            {t('result.see')}
          </button>
        )} />
        <SummaryRow title={t('result.outside_title')} text={format.list(outside)} />
        <SummaryRow title={t('result.recipients_title')} text={t('result.recipients_text_short')} action={(
          <BasisLink view="recipients" label={t('result.see')} ariaLabel={t('basis.see_categories')} icon={false}
            className="shrink-0 self-center px-1 text-[0.8125rem] whitespace-nowrap" />
        )} />
      </ul>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('result.choices_title')} description={note}>
        <div className="-mx-5 -my-4">
          <ChoiceRows id={calc.id} rows={rows} onGo={onGo} />
        </div>
      </BottomSheet>
    </>
  );
}
