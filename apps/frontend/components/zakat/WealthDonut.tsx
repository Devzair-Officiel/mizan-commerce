'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { formatMoney, type ZakatCalculation } from '@/lib/hooks/useZakat';

interface WealthDonutProps {
  calc: ZakatCalculation;
}

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const SLICE_COLORS = {
  cash: 'hsl(var(--primary))',
  receivables: '#0EA5E9',
  stock: '#F59E0B',
} as const;

function buildSlices(calc: ZakatCalculation): Slice[] {
  const cash = parseFloat(calc.cash_amount) || 0;
  const receivables = parseFloat(calc.receivables_amount) || 0;
  const stock = parseFloat(calc.stock_value_for_base) || 0;
  return [
    { key: 'cash', label: 'Argent disponible', value: cash, color: SLICE_COLORS.cash },
    { key: 'receivables', label: 'Créances', value: receivables, color: SLICE_COLORS.receivables },
    { key: 'stock', label: 'Stock', value: stock, color: SLICE_COLORS.stock },
  ].filter((s) => s.value > 0);
}

function DonutTooltip({ active, payload, currency }: TooltipContentProps & { currency: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0];
  if (!first) return null;
  const slice = first.payload as Slice;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{slice.label}</p>
      <p className="text-sm font-semibold text-foreground tabular-nums">
        {formatMoney(slice.value, currency)}
      </p>
    </div>
  );
}

export function WealthDonut({ calc }: WealthDonutProps) {
  const slices = buildSlices(calc);
  if (slices.length === 0) return null;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Répartition du patrimoine
      </p>
      <div className="flex items-center gap-4">
        <div className="relative h-32 w-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="65%"
                outerRadius="100%"
                stroke="none"
                paddingAngle={2}
              >
                {slices.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
              <Tooltip content={(props) => <DonutTooltip {...props} currency={calc.currency} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {formatMoney(total, calc.currency)}
            </p>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-2">
          {slices.map((s) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs text-foreground truncate">{s.label}</p>
                    <p className="text-xs font-medium tabular-nums text-muted-foreground">
                      {pct.toFixed(0)}&nbsp;%
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
