'use client';

import { SectionCard } from '@/components/ui/SectionCard';
import { useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { NegativeAmount } from '../shared/NegativeAmount';

interface LinesListProps {
  document: Pick<Invoice, 'lines' | 'currency'>;
  title: string;
  /** Avoir : prix et montants affichés négatifs, comme le PDF. */
  negative?: boolean;
}

/** Lignes d'une facture, d'un devis ou d'un avoir : désignation, quantité × prix unitaire HT, montant HT. */
export function LinesList({ document, title, negative }: LinesListProps) {
  const money = useFormatMoney();
  const number = useFormatNumber();
  const m = (value: string) => negative ? <NegativeAmount value={value} currency={document.currency} /> : money(value, document.currency);
  return <SectionCard title={title}>
    <ul className="divide-y divide-border">
      {document.lines.map(line => <li key={line.id} className="flex items-start gap-3 px-4 py-3.5 lg:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{line.description}</p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{number(Number(line.quantity))} × {m(line.unit_price_ht)}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">{m(line.line_subtotal_ht)}</span>
      </li>)}
    </ul>
  </SectionCard>;
}
