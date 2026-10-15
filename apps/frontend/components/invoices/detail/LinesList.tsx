'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';

export function LinesList({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('invoices.detail');
  const money = useFormatMoney();
  const number = useFormatNumber();
  return <SectionCard title={t('lines_title')}>
    <ul className="divide-y divide-border">
      {invoice.lines.map(line => <li key={line.id} className="flex items-start gap-3 px-4 py-3.5 lg:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{line.description}</p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{number(Number(line.quantity))} × {money(line.unit_price_ht, invoice.currency)}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">{money(line.line_subtotal_ht, invoice.currency)}</span>
      </li>)}
    </ul>
  </SectionCard>;
}
