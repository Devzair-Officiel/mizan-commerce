import { formatInvoiceMoney, type Invoice } from '@/lib/hooks/useInvoices';

export function LinesList({ invoice }: { invoice: Invoice }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Détail
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {invoice.lines.map((line) => (
          <li key={line.id} className="flex items-start gap-3 px-4 py-3">
            <div className="flex flex-1 flex-col min-w-0">
              <p className="text-sm font-medium text-foreground">{line.description}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {parseFloat(line.quantity)} × {formatInvoiceMoney(line.unit_price_ht, invoice.currency)}
              </p>
            </div>
            <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">
              {formatInvoiceMoney(line.line_subtotal_ht, invoice.currency)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
