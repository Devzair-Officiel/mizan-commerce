'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil, PackageMinus, PackagePlus, PowerOff, Power,
  MoreHorizontal, Package, Sparkles, FileText, Camera, AlertTriangle,
  Boxes, Tag,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  useProduct,
  useDeactivateProduct,
  useReactivateProduct,
  useUploadProductImage,
  formatPriceRange,
  type ProductDetail,
} from '@/lib/hooks/useProducts';
import { VariantsManager } from '@/components/products/VariantsManager';

type Badge = { label: string; classes: string };

function getProductBadge(product: ProductDetail): Badge {
  if (!product.is_active) {
    return {
      label: 'Inactif',
      classes: 'bg-muted text-muted-foreground border border-border',
    };
  }
  if (product.type === 'product' && product.is_out_of_stock) {
    return {
      label: 'Rupture',
      classes: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-400/20',
    };
  }
  if (product.type === 'product' && product.is_low_stock) {
    return {
      label: 'Stock faible',
      classes: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-400/20',
    };
  }
  return {
    label: product.type === 'service' ? 'Service' : 'Actif',
    classes: 'bg-primary/10 text-primary border border-primary/20',
  };
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const deactivate = useDeactivateProduct();
  const reactivate = useReactivateProduct();
  const uploadImage = useUploadProductImage(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await uploadImage.mutateAsync(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erreur lors de l'upload.");
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDeactivate() {
    if (!confirm('Désactiver ce produit ?')) return;
    await deactivate.mutateAsync(id);
    router.push('/products');
  }

  if (isLoading) return <><TopBar title="Produit" /><ProductDetailSkeleton /></>;
  if (!product) return <><TopBar title="Produit" /><p className="p-4 text-sm text-destructive">Produit introuvable.</p></>;

  const isProduct = product.type === 'product';
  const badge = getProductBadge(product);
  const priceRange = formatPriceRange(product.min_selling_price, product.max_selling_price);
  const variantCount = product.variant_count ?? product.variants.length;
  const stockTone =
    product.is_out_of_stock
      ? 'text-red-600 dark:text-red-400'
      : product.is_low_stock
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground';

  return (
    <>
      <TopBar title={product.name} />

      {/* Bottom sheet — Actions secondaires */}
      <BottomSheet open={showMore} onClose={() => setShowMore(false)} title="Actions">
        <div className="flex flex-col gap-1.5">
          {isProduct && (
            <ActionRow
              icon={<PackageMinus size={18} />}
              label="Sortie stock"
              onClick={() => { setShowMore(false); router.push(`/stock/out?product=${id}`); }}
            />
          )}
          <ActionRow
            icon={<Camera size={18} />}
            label={product.primary_image ? 'Remplacer la photo' : 'Ajouter une photo'}
            description="JPEG, PNG ou WebP — 5 Mo max"
            onClick={() => { setShowMore(false); fileInputRef.current?.click(); }}
          />
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          {product.is_active ? (
            <ActionRow
              icon={<PowerOff size={18} />}
              label="Désactiver le produit"
              description="Le produit n'apparaîtra plus dans la liste"
              onClick={async () => { setShowMore(false); await handleDeactivate(); }}
              disabled={deactivate.isPending}
              tone="danger"
            />
          ) : (
            <ActionRow
              icon={<Power size={18} />}
              label="Réactiver le produit"
              onClick={async () => { setShowMore(false); await reactivate.mutateAsync(id); }}
              disabled={reactivate.isPending}
              tone="success"
            />
          )}
        </div>
      </BottomSheet>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col gap-5 p-4">
        {/* Hero card */}
        <div
          className="rounded-3xl p-5 flex flex-col items-center gap-2"
          style={{ background: 'color-mix(in oklch, var(--primary) 7%, transparent)' }}
        >
          <ProductAvatar product={product} onUpload={() => fileInputRef.current?.click()} uploading={uploadImage.isPending} />

          <div className="flex flex-col items-center gap-1.5">
            <p className="text-2xl font-semibold text-foreground text-center">{product.name}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.classes}`}>
              {badge.label}
            </span>
          </div>

          {/* Action bar */}
          <div className="flex w-full items-center gap-2 mt-2">
            {isProduct ? (
              <Link
                href={`/stock/add?product=${id}`}
                className="flex flex-1 items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 transition-transform"
              >
                <PackagePlus size={18} />
                <span className="text-sm font-semibold">Entrée stock</span>
              </Link>
            ) : (
              <Link
                href={`/products/${id}/edit`}
                className="flex flex-1 items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 transition-transform"
              >
                <Pencil size={18} />
                <span className="text-sm font-semibold">Modifier</span>
              </Link>
            )}
            {isProduct && (
              <Link
                href={`/products/${id}/edit`}
                aria-label="Modifier"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
              >
                <Pencil size={20} />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setShowMore(true)}
              aria-label="Plus d'actions"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
            >
              <MoreHorizontal size={22} />
            </button>
          </div>

          {uploadError && (
            <p className="mt-2 text-xs text-destructive">{uploadError}</p>
          )}
        </div>

        {/* Stats — grille 2 colonnes pour les produits, prix seul pour services */}
        {isProduct ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Boxes size={13} className="text-muted-foreground/80" />
                  <p className="text-xs text-muted-foreground">Formats actifs</p>
                </div>
                {(product.is_out_of_stock || product.is_low_stock) && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={12} />
                  </div>
                )}
              </div>
              <p className={`text-2xl font-bold tabular-nums ${stockTone}`}>
                {variantCount}
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                Détail par format ci-dessous
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Tag size={12} className="text-muted-foreground/80" />
                <p className="text-xs text-muted-foreground">Prix de vente</p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {priceRange ?? product.variants[0]?.selling_price ?? '—'} €
              </p>
              {variantCount > 1 && (
                <p className="text-[11px] text-muted-foreground/80">
                  Selon le conditionnement
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Tag size={12} className="text-muted-foreground/80" />
              <p className="text-xs text-muted-foreground">Prix de la prestation</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {priceRange ?? product.variants[0]?.selling_price ?? '—'} €
            </p>
          </div>
        )}

        {/* Conditionnements / variantes */}
        <VariantsManager product={product} />

        {/* Description — uniquement si renseignée */}
        {product.description && (
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </h2>
            </div>
            <p className="text-sm text-foreground whitespace-pre-line">{product.description}</p>
          </div>
        )}
      </div>
    </>
  );
}

function ProductAvatar({
  product,
  onUpload,
  uploading,
}: {
  product: ProductDetail;
  onUpload: () => void;
  uploading: boolean;
}) {
  const isService = product.type === 'service';

  return (
    <button
      type="button"
      onClick={onUpload}
      disabled={uploading}
      aria-label={product.primary_image ? 'Remplacer la photo' : 'Ajouter une photo'}
      className="relative flex h-20 w-20 items-center justify-center rounded-full overflow-hidden shadow-md ring-2 ring-background active:scale-95 transition-transform disabled:opacity-60"
      style={{ background: 'var(--primary)' }}
    >
      {product.primary_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.primary_image}
          alt={product.name}
          className="h-full w-full object-cover"
        />
      ) : isService ? (
        <Sparkles size={28} className="text-primary-foreground" />
      ) : (
        <Package size={28} className="text-primary-foreground" />
      )}
      <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow">
        <Camera size={11} className="text-foreground" />
      </span>
    </button>
  );
}

type ActionRowTone = 'default' | 'success' | 'danger';

function ActionRow({
  icon,
  label,
  description,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  tone?: ActionRowTone;
}) {
  const iconClasses =
    tone === 'danger'
      ? 'bg-red-500/10 text-red-500 dark:bg-red-500/15 dark:text-red-400'
      : tone === 'success'
        ? 'bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400'
        : 'bg-primary/10 text-primary';
  const labelClasses =
    tone === 'danger'
      ? 'text-red-500 dark:text-red-400'
      : tone === 'success'
        ? 'text-green-600 dark:text-green-400'
        : 'text-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:bg-muted disabled:opacity-60"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClasses}`}>
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`text-sm font-medium ${labelClasses}`}>{label}</span>
        {description && (
          <span className="truncate text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </button>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-4" aria-hidden>
      <div className="rounded-3xl p-5 flex flex-col items-center gap-3 bg-muted/30">
        <div className="h-20 w-20 rounded-full bg-muted animate-pulse" />
        <div className="h-5 w-40 rounded bg-muted animate-pulse" />
        <div className="h-4 w-16 rounded-full bg-muted animate-pulse" />
        <div className="h-12 w-full rounded-full bg-muted animate-pulse mt-2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
      </div>
      <div className="h-40 rounded-2xl bg-muted animate-pulse" />
    </div>
  );
}
