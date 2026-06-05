import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useProduct, type ProductVariant } from '@/lib/hooks/useProducts';

export type VariantPick = {
  variantId: string;
  productName: string;
  variantName: string;
  productType: 'product' | 'service';
  unitPrice: string;
};

interface VariantViewProps {
  productId: string;
  onBack: () => void;
  onPick: (pick: VariantPick) => void;
}

export function VariantView({ productId, onBack, onPick }: VariantViewProps) {
  const { data: product, isLoading } = useProduct(productId);

  function handlePick(variant: ProductVariant) {
    if (!product) return;
    onPick({
      variantId: variant.id,
      productName: product.name,
      variantName: variant.packaging_name,
      productType: product.type,
      unitPrice: variant.selling_price,
    });
  }

  if (isLoading || !product) {
    return (
      <div className="flex flex-col gap-3">
        <BackButton onBack={onBack} label="Retour" />
        <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  const activeVariants = product.variants.filter((v) => v.is_active);

  return (
    <div className="flex flex-col gap-3">
      <BackButton onBack={onBack} label="Retour au catalogue" />

      <div className="px-1">
        <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {activeVariants.length} conditionnement{activeVariants.length > 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex flex-col divide-y divide-border -mx-5 px-5">
        {activeVariants.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun conditionnement actif.</p>
        ) : (
          activeVariants.map((v) => {
            const out = product.type === 'product' && parseFloat(v.stock_quantity) <= 0;
            return (
              <button
                key={v.id}
                type="button"
                disabled={out}
                onClick={() => handlePick(v)}
                className="flex items-center gap-3 px-1 py-3 text-left transition-colors active:bg-muted disabled:opacity-50"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground truncate">{v.packaging_name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {v.selling_price} €
                    {product.type === 'product' && (
                      <>
                        {' · '}
                        <span className={out ? 'text-destructive' : v.is_low_stock ? 'text-amber-600' : ''}>
                          {out ? 'Rupture' : `Stock : ${v.stock_quantity}`}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function BackButton({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="self-start flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft size={14} />
      <span>{label}</span>
    </button>
  );
}
