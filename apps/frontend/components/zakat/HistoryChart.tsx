'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

interface HistoryChartProps {
  calculations: ZakatCalculation[];
}

interface ChartDatum {
  year: string;
  amount: number;
  base: number;
  currency: string;
  date: string;
}

function buildSeries(calculations: ZakatCalculation[]): ChartDatum[] {
  return [...calculations]
    .sort((a, b) => a.reference_date.localeCompare(b.reference_date))
    .map((c) => ({
      year: new Date(c.reference_date).getFullYear().toString(),
      amount: parseFloat(c.zakat_amount) || 0,
      base: parseFloat(c.zakat_base) || 0,
      currency: c.currency,
      date: c.reference_date,
    }));
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0];
  if (!first) return null;
  const datum = first.payload as ChartDatum;
  const dateLabel = new Date(datum.date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{dateLabel}</p>
      <p className="text-sm font-semibold text-foreground tabular-nums">
        {formatMoney(datum.amount, datum.currency)}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        Base&nbsp;: {formatMoney(datum.base, datum.currency)}
      </p>
    </div>
  );
}

export function HistoryChart({ calculations }: HistoryChartProps) {
  const data = buildSeries(calculations);
  if (data.length < 2) return null;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Évolution annuelle
      </p>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()
              }
            />
            <Tooltip
              content={(props) => <ChartTooltip {...props} />}
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
            />
            <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Montant de zakat dû par exercice — {data.length} année{data.length > 1 ? 's' : ''} enregistrée{data.length > 1 ? 's' : ''}.
      </p>
    </div>
  );
}
