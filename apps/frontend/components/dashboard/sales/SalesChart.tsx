'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DotItemDotProps, TooltipContentProps } from 'recharts';
import { getDirection } from '@/i18n/locales';
import { useFormatMoney, useLocaleSafe } from '@/lib/hooks/useFormat';
import type { SalesData } from '@/lib/hooks/useDashboard';
import { useSalesLabels } from './useSalesLabels';

interface ChartPoint {
  date: string;
  value: number;
  count: number;
}

const TICK = { fontSize: 11, fill: 'var(--muted-foreground)' };

/** Dernier point (aujourd'hui, ce mois-ci) mis en avant. */
function LastDot({ cx, cy, index, points }: DotItemDotProps) {
  if (index !== points.length - 1 || cx == null || cy == null) return null;
  return <circle key={index} cx={cx} cy={cy} r={5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />;
}

interface SalesChartProps {
  data: SalesData;
  currency: string;
}

/**
 * Courbe des ventes (recharts) : zone en dégradé du primaire, repères en pointillés, bulle au
 * survol et au clavier (flèches, couche d'accessibilité de recharts). Pour « Depuis le début » :
 * une dizaine de libellés au plus et un repère par année. Couleurs : tokens uniquement.
 */
export function SalesChart({ data, currency }: SalesChartProps) {
  const t = useTranslations('dashboard.sales');
  const formatMoney = useFormatMoney();
  const rtl = getDirection(useLocaleSafe()) === 'rtl';
  const gradient = `sales-${useId().replace(/[^\w-]/g, '')}`;
  const labels = useSalesLabels(data.granularity, data.points.at(-1)?.date);
  const points: ChartPoint[] = data.points.map((p) => ({ date: p.date, value: Number(p.revenue), count: p.orders_count }));
  const all = data.period === 'all';
  // Au plus une dizaine de libellés ; recharts éclaircit encore s'ils se touchent (360px).
  const step = Math.ceil(points.length / 10);
  const ticks = all ? points.filter((_, i) => i % step === 0).map((p) => p.date) : undefined;
  const years = all ? points.filter((p, i) => i === 0 || labels.year(p.date) !== labels.year(points[i - 1]?.date ?? '')) : [];

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = active ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined;
    if (!point) return null;
    return (
      <p className="whitespace-nowrap rounded-[0.625rem] bg-foreground px-2.5 py-1.5 text-xs text-background first-letter:uppercase">
        {t('tooltip', { label: labels.full(point.date), amount: formatMoney(point.value, currency), count: point.count })}
      </p>
    );
  };

  return (
    <div className="mt-3.5 h-47.5">
      {/* Dimensions non nulles dès le premier rendu : sans elles, recharts avertit (largeur -1). */}
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 190 }}>
        <AreaChart data={points} margin={{ top: 20, right: 16, bottom: 0, left: 16 }} title={t('chart_label')}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <YAxis hide domain={[0, 'auto']} tickCount={4} />
          <XAxis dataKey="date" ticks={ticks} tickFormatter={labels.tick} tick={TICK} axisLine={false} tickLine={false}
            interval="preserveStartEnd" minTickGap={6} tickMargin={8} reversed={rtl} />
          {years.map((p) => (
            <ReferenceLine key={p.date} x={p.date} stroke="var(--border)"
              label={{ value: labels.year(p.date), position: rtl ? 'insideTopRight' : 'insideTopLeft', fontSize: 11, fontWeight: 600, fill: 'var(--muted-foreground)' }} />
          ))}
          <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.35 }}
            position={{ y: 0 }} allowEscapeViewBox={{ x: false, y: true }} isAnimationActive={false} />
          <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round"
            fill={`url(#${gradient})`} dot={LastDot}
            activeDot={{ r: 5, fill: 'var(--card)', stroke: 'var(--primary)', strokeWidth: 2.5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
