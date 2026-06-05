import type { RevenueDayPoint } from '@/lib/hooks/useDashboard';
import { formatCompactRevenue, formatRevenue } from './utils';

interface RevenueSparklineProps {
  points: RevenueDayPoint[];
  currency: string;
}

export function RevenueSparkline({ points, currency }: RevenueSparklineProps) {
  const values = points.map((p) => Number(p.revenue) || 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          CA — 7 derniers jours
        </div>
        <div className="text-xs font-semibold text-foreground tabular-nums">
          {formatRevenue(total, currency)}
        </div>
      </div>
      <div className="flex items-end gap-1.5">
        {values.map((v, i) => {
          const heightPct = (v / max) * 100;
          const isToday = i === values.length - 1;
          const point = points[i];
          if (!point) return null;
          const date = new Date(point.date);
          const dayNum = date.getDate();
          return (
            <div key={point.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className={`text-[9px] tabular-nums ${isToday ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                {v > 0 ? formatCompactRevenue(v) : '—'}
              </span>
              <div className="w-full h-16 flex flex-col justify-end">
                <div
                  className={`w-full rounded-t-md ${isToday ? 'bg-primary' : 'bg-muted-foreground/60'} transition-colors`}
                  style={{ height: `${Math.max(heightPct, 4)}%` }}
                  title={`${formatRevenue(v, currency)} — ${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}`}
                />
              </div>
              <span className={`text-[10px] tabular-nums ${isToday ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                {String(dayNum).padStart(2, '0')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
