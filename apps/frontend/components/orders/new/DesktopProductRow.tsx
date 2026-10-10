'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { productPickQueryOptions, type Product } from '@/lib/hooks/useProducts';
import { DesktopAddButton } from '@/components/orders/new/DesktopAddButton';
import { DesktopInlineVariants } from '@/components/orders/new/DesktopInlineVariants';
import type { LineItem } from '@/components/orders/new/types';
import type { VariantPick } from '@/components/orders/picker/VariantView';

type AddState = 'idle' | 'loading' | 'out_of_stock' | 'error';

function ProductSubtext({ p }: { p: Product }) {
  const t = useTranslations('orders.picker');
  if (p.type === 'service') return null;
  if (p.variant_count > 1) {
    return (
      <p className="text-[0.8125rem] text-muted-foreground mt-0.5">
        {t('variant_formats', { count: p.variant_count })}
        {p.is_out_of_stock && <> · <span className="text-destructive">{t('out_of_stock')}</span></>}
      </p>
    );
  }
  if (p.is_out_of_stock) return <p className="text-[0.8125rem] text-destructive mt-0.5">{t('out_of_stock')}</p>;
  return null;
}

/** Ajout d'un article à variante unique : réutilise la variante déjà au ticket, sinon la charge. */
function useSingleVariantAdd(p: Product, lines: LineItem[], onPick: (pick: VariantPick) => void) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AddState>('idle');

  // Les messages (rupture, erreur réseau) s'effacent seuls après quelques secondes.
  useEffect(() => {
    if (state !== 'out_of_stock' && state !== 'error') return;
    const timer = setTimeout(() => setState('idle'), 3000);
    return () => clearTimeout(timer);
  }, [state]);

  async function add() {
    if (state === 'loading') return;
    // Retrouvée par l'identifiant (et non le nom) : deux articles homonymes restent distincts.
    const existing = lines.find((i) => i.variant !== null);
    if (existing?.variant) {
      onPick({ variantId: existing.variant, productId: p.id, productName: existing.product_name, variantName: existing.variant_name, productType: existing.product_type ?? p.type, unitPrice: existing.unit_price });
      return;
    }
    setState('loading');
    try {
      const detail = await queryClient.fetchQuery(productPickQueryOptions(p.id));
      const single = detail.variants.find((v) => v.is_active);
      if (!single) { setState('idle'); return; }
      if (detail.type === 'product' && parseFloat(single.stock_quantity) <= 0) { setState('out_of_stock'); return; }
      onPick({ variantId: single.id, productId: detail.id, productName: detail.name, variantName: single.packaging_name, productType: detail.type, unitPrice: single.selling_price });
      setState('idle');
    } catch {
      setState('error');
    }
  }

  return { state, add };
}

export function DesktopProductRow({ p, items, isExpanded, onToggle, onPick, money, showServiceBadge }: {
  p: Product; items: LineItem[]; isExpanded: boolean; onToggle: () => void;
  onPick: (pick: VariantPick) => void; money: (v: number | string) => string; showServiceBadge: boolean;
}) {
  const t = useTranslations('orders.picker');
  const lines = items.filter((i) => i.product === p.id);
  const totalQty = lines.reduce((a, c) => a + c.quantity, 0);
  const single = useSingleVariantAdd(p, lines, onPick);
  const multi = p.variant_count > 1;
  const { min_selling_price: min, max_selling_price: max } = p;
  const priceLabel = min ? (min === max || !max ? money(min) : `${money(min)} – ${money(max)}`) : '—';

  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
            {p.type === 'service' && showServiceBadge && (
              <span className="shrink-0 h-5 px-2 rounded-full bg-muted text-muted-foreground text-[11px] font-medium flex items-center">
                {t('service_badge')}
              </span>
            )}
          </div>
          <ProductSubtext p={p} />
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{priceLabel}</span>
        <DesktopAddButton name={p.name} qty={totalQty} isLoading={single.state === 'loading'}
          onClick={multi ? onToggle : () => void single.add()} />
      </div>
      {(single.state === 'out_of_stock' || single.state === 'error') && (
        <p role="alert" className="px-5 pb-2 text-xs text-destructive">
          {t(single.state === 'error' ? 'add_error' : 'out_of_stock_pick')}
        </p>
      )}
      {isExpanded && multi && <DesktopInlineVariants productId={p.id} items={items} onPick={onPick} money={money} />}
    </div>
  );
}
