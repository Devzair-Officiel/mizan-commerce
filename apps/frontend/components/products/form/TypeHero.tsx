import { Package, Sparkles } from 'lucide-react';
import type { ProductType } from '@/lib/hooks/useProducts';

export function TypeHero({ type }: { type: ProductType }) {
  const isProduct = type === 'product';
  const Icon = isProduct ? Package : Sparkles;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon size={20} className="text-primary" />
      </div>
      <div className="flex flex-col">
        <p className="text-sm font-semibold text-foreground">
          {isProduct ? 'Produit physique' : 'Service'}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {isProduct
            ? 'Stock suivi, unité de vente à définir.'
            : 'Pas de stock — un prix et une description suffisent.'}
        </p>
      </div>
    </div>
  );
}
