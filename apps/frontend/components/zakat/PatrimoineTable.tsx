'use client';

import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/hooks/useZakat';

interface PatrimoineRow {
  label: string;
  amount: string | number;
  hint?: string;
  tone?: 'add' | 'sub';
  icon?: ReactNode;
}

interface PatrimoineTableProps {
  title: string;
  rows: PatrimoineRow[];
  total: string | number;
  totalLabel: string;
  currency: string;
  tone?: 'positive' | 'negative';
}

export function PatrimoineTable({
  title,
  rows,
  total,
  totalLabel,
  currency,
  tone = 'positive',
}: PatrimoineTableProps) {
  const totalColor = tone === 'positive' ? 'text-foreground' : 'text-destructive';

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </p>
      </div>

      <div className="flex flex-col">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 px-4">
            Rien à déclarer dans cette catégorie.
          </p>
        )}

        {rows.map((row, idx) => {
          const sign = row.tone === 'sub' ? '−' : row.tone === 'add' ? '+' : '';
          const valueColor = row.tone === 'sub' ? 'text-destructive' : 'text-foreground';
          return (
            <div
              key={idx}
              className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/40 last:border-0"
            >
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                {row.icon && <span className="shrink-0 mt-0.5 text-muted-foreground">{row.icon}</span>}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-sm text-foreground truncate">{row.label}</p>
                  {row.hint && <p className="text-xs text-muted-foreground">{row.hint}</p>}
                </div>
              </div>
              <p className={`text-sm font-medium tabular-nums shrink-0 ${valueColor}`}>
                {sign} {formatMoney(row.amount, currency)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-t border-border">
        <p className="text-sm font-medium text-foreground">{totalLabel}</p>
        <p className={`text-base font-semibold tabular-nums ${totalColor}`}>
          {formatMoney(total, currency)}
        </p>
      </div>
    </div>
  );
}
