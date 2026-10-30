'use client';

import { SectionCard } from '@/components/ui/SectionCard';
import { useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';

/** Lignes d'une facture ou d'un devis : désignation, quantité × prix unitaire HT, montant HT. */
export function LinesList({ document, title }: { document: Pick<Invoice, 'lines' | 'currency'>; title: string }) {
  const money = useFormatMoney();
  const number = useFormatNumber();
  return <SectionCard title={title}>
    <ul className="divide-y divide-border">
      {document.lines.map(line => <li key={line.id} className="flex items-start gap-3 px-4 py-3.5 lg:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{line.description}</p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{number(Number(line.quantity))} × {money(line.unit_price_ht, document.currency)}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">{money(line.line_subtotal_ht, document.currency)}</span>
      </li>)}
    </ul>
  </SectionCard>;
}
