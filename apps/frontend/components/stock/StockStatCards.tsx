'use client';

import { useTranslations } from 'next-intl';
import { CircleMinus, Coins, PackageX, TriangleAlert } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useStockLevelsSummary } from '@/lib/hooks/useStock';
import type { StockStatCardKey } from './levels/useStockLevelsState';

interface StockStatCardsProps {
  currency: string;
  active: Record<StockStatCardKey, boolean>;
  onToggle: (card: StockStatCardKey) => void;
}

/** Indicateurs du stock : négatif, rupture et stock faible filtrent ; la valeur trie par valeur. */
export function StockStatCards({ currency, active, onToggle }: StockStatCardsProps) {
  const t = useTranslations('stock.stats');
  const formatMoney = useFormatMoney();
  const { data } = useStockLevelsSummary();

  if (!data) return <div className="h-72 lg:h-35" aria-hidden />;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <StatCard label={t('negative_label')} sub={t('negative_sub')} value={data.negative}
        icon={<CircleMinus size={16} />} tone="red" toneValue={data.negative > 0}
        onClick={() => onToggle('negative')} pressed={active.negative} />
      <StatCard label={t('out_label')} sub={t('out_sub')} value={data.out_of_stock}
        icon={<PackageX size={16} />} tone="red" toneValue={data.out_of_stock > 0}
        onClick={() => onToggle('out')} pressed={active.out} />
      <StatCard label={t('low_label')} sub={t('low_sub')} value={data.low_stock}
        icon={<TriangleAlert size={16} />} tone="amber" toneValue={data.low_stock > 0}
        onClick={() => onToggle('low')} pressed={active.low} />
      <StatCard label={t('value_label')} sub={t('value_sub')} value={formatMoney(data.purchase_value, currency)}
        icon={<Coins size={16} />} onClick={() => onToggle('value')} pressed={active.value} />
    </div>
  );
}
