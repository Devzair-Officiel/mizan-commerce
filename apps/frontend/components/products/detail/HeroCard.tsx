import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, PackagePlus, Pencil } from 'lucide-react';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { ProductAvatar } from './ProductAvatar';
import { getProductBadge } from './badge';

interface HeroCardProps {
  product: ProductDetail;
  onPickPhoto: () => void;
  onShowMore: () => void;
  uploading: boolean;
  uploadError: string | null;
}

export function HeroCard({ product, onPickPhoto, onShowMore, uploading, uploadError }: HeroCardProps) {
  const t = useTranslations('articles.hero');
  const tBadges = useTranslations('articles.badges');
  const badge = getProductBadge(product);
  const isProduct = product.type === 'product';
  const id = product.id;

  return (
    <div
      className="rounded-3xl p-5 flex flex-col items-center gap-2"
      style={{ background: 'color-mix(in oklch, var(--primary) 7%, transparent)' }}
    >
      <ProductAvatar product={product} onUpload={onPickPhoto} uploading={uploading} />

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-2xl font-semibold text-foreground text-center">{product.name}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.classes}`}>
          {tBadges(badge.labelKey)}
        </span>
      </div>

      <div className="flex w-full items-center gap-2 mt-2">
        {isProduct ? (
          <Link
            href={`/stock/add?product=${id}`}
            className="flex flex-1 items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 transition-transform"
          >
            <PackagePlus size={18} />
            <span className="text-sm font-semibold">{t('stock_in')}</span>
          </Link>
        ) : (
          <Link
            href={`/products/${id}/edit`}
            className="flex flex-1 items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 transition-transform"
          >
            <Pencil size={18} />
            <span className="text-sm font-semibold">{t('edit')}</span>
          </Link>
        )}
        {isProduct && (
          <Link
            href={`/products/${id}/edit`}
            aria-label={t('edit')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
          >
            <Pencil size={20} />
          </Link>
        )}
        <button
          type="button"
          onClick={onShowMore}
          aria-label={t('more_actions')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary active:scale-95 transition-transform"
        >
          <MoreHorizontal size={22} />
        </button>
      </div>

      {uploadError && <p className="mt-2 text-xs text-destructive">{uploadError}</p>}
    </div>
  );
}
