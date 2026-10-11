'use client';

import { useTranslations } from 'next-intl';
import { MovementQuantity } from '@/components/stock/movements/MovementQuantity';
import { useStockFormat } from '@/components/stock/useStockFormat';
import { useStockMovements } from '@/lib/hooks/useStock';
import { isDefaultVariant } from '@/lib/products';
import { SectionCard } from '@/components/ui/SectionCard';
import { ProductMovementLabel } from './ProductMovementLabel';
import { SkeletonRows } from '@/components/ui/SkeletonRows';

const SHOWN = 5;

/** Carte « Derniers mouvements » : les 5 plus récents, tous formats, et « Voir tout » vers le stock. */
export function ProductMovementsCard({ productId }: { productId: string }) {
  const t = useTranslations('articles.sheet');
  const f = useStockFormat();
  const { data, isLoading, isError } = useStockMovements({ product: productId, pageSize: SHOWN });
  const movements = data?.results ?? [];
  const seeAll = (data?.count ?? 0) > 0 ? { label: t('see_all'), href: `/stock?tab=mouvements&product=${productId}` } : undefined;
  const empty = isError ? t('movements_error') : t('movements_empty');

  return (
    <SectionCard title={t('movements_title')} rightLink={seeAll}>
      {isLoading ? (
        <SkeletonRows />
      ) : movements.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {movements.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 lg:px-5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm"><ProductMovementLabel movement={m} /></p>
                <p className="text-xs text-muted-foreground">
                  {!isDefaultVariant(m.variant_name) && <><span dir="auto">{m.variant_name}</span>, </>}
                  {f.dateTime(m.created_at)}
                  {m.author_name && <>, <span dir="auto">{m.author_name}</span></>}
                </p>
              </div>
              <MovementQuantity signed={m.signed_quantity} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
