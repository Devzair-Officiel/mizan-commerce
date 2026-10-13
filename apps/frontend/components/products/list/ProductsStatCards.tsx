'use client';

import { useTranslations } from 'next-intl';
import { CircleCheck, PackageX, TriangleAlert } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import type { CatalogKind } from '@/lib/hooks/useMe';
import { useProductsSummary } from '@/lib/hooks/useProducts';
import type { ProductsStatCardKey } from './useProductsPageState';

interface ProductsStatCardsProps {
  kind: CatalogKind;
  active: Record<ProductsStatCardKey, boolean>;
  onToggle: (card: ProductsStatCardKey) => void;
}

/**
 * Indicateurs de la page Articles : chacun bascule son filtre. Pas
 * d'indicateur de stock pour une boutique de services.
 */
export function ProductsStatCards({ kind, active, onToggle }: ProductsStatCardsProps) {
  const t = useTranslations('articles.list.stats');
  const { data } = useProductsSummary();
  const hasStock = kind !== 'services';

  if (!data) return <div className={hasStock ? 'h-72 lg:h-32.5' : 'h-32.5'} aria-hidden />;

  const activeCount = kind === 'products' ? data.products : kind === 'services' ? data.services : data.total;
  return (
    <div className="grid grid-cols-2 gap-3 max-lg:*:last:odd:col-span-2 lg:grid-cols-3 lg:gap-4">
      {hasStock && (
        <>
          <StatCard label={t('out_label')} value={data.out_of_stock} icon={<PackageX size={16} />}
            tone="red" toneValue={data.out_of_stock > 0} onClick={() => onToggle('out')} pressed={active.out} />
          <StatCard label={t('low_label')} value={data.low_stock} icon={<TriangleAlert size={16} />}
            tone="amber" toneValue={data.low_stock > 0} onClick={() => onToggle('low')} pressed={active.low} />
        </>
      )}
      <StatCard label={t('active_label', { kind })} value={activeCount} icon={<CircleCheck size={16} />}
        tone="green" onClick={() => onToggle('active')} pressed={active.active} />
    </div>
  );
}
