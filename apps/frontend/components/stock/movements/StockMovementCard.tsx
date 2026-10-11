'use client';

import Link from 'next/link';
import type { StockMovement } from '@/lib/hooks/useStock';
import { cn } from '@/lib/utils';
import { StockVariantCell } from '../StockVariantCell';
import { useStockFormat } from '../useStockFormat';
import { MovementQuantity } from './MovementQuantity';
import { MovementReference } from './MovementReference';
import { MovementTypeBadge } from './MovementTypeBadge';

/**
 * Carte mobile d'un mouvement. Pas de lien sur toute la carte : la référence
 * de commande est elle-même un lien ; l'article mène à sa fiche.
 */
export function StockMovementCard({ movement: m, first }: { movement: StockMovement; first: boolean }) {
  const f = useStockFormat();
  return (
    <div className={cn('flex flex-col gap-1.5 px-4 py-3', !first && 'border-t border-border')}>
      <div className="flex items-start gap-3">
        <Link href={`/products/${m.product_id}`} className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StockVariantCell productName={m.product_name} packagingName={m.variant_name} />
        </Link>
        <MovementQuantity signed={m.signed_quantity} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
        <MovementTypeBadge group={m.type_group} />
        <span className="min-w-0"><MovementReference movement={m} /></span>
      </div>
      <p className="text-xs text-muted-foreground">
        {f.time(m.created_at)}{m.author_name && <>, <span dir="auto">{m.author_name}</span></>}
      </p>
    </div>
  );
}
