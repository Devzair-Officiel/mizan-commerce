'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PackageMinus, PowerOff, Power, Camera, FileText } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { VariantsManager } from '@/components/products/VariantsManager';
import { ActionRow } from '@/components/products/detail/ActionRow';
import { HeroCard } from '@/components/products/detail/HeroCard';
import { StatsGrid } from '@/components/products/detail/StatsGrid';
import { ProductDetailSkeleton } from '@/components/products/detail/Skeleton';
import {
  useProduct,
  useDeactivateProduct,
  useReactivateProduct,
  useUploadProductImage,
} from '@/lib/hooks/useProducts';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations('articles.detail');
  const tActions = useTranslations('articles.actions');
  const tHero = useTranslations('articles.hero');
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
      setUploadError(err instanceof Error ? err.message : t('upload_error'));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDeactivate() {
    if (!confirm(t('confirm_deactivate'))) return;
    await deactivate.mutateAsync(id);
    router.push('/products');
  }

  if (isLoading) return <><TopBar title={t('title')} /><ProductDetailSkeleton /></>;
  if (!product) return <><TopBar title={t('title')} /><p className="p-4 text-sm text-destructive">{t('not_found')}</p></>;

  const isProduct = product.type === 'product';

  return (
    <>
      <TopBar title={product.name} />

      <BottomSheet open={showMore} onClose={() => setShowMore(false)} title={tHero('more_actions')}>
        <div className="flex flex-col gap-1.5">
          {isProduct && (
            <ActionRow
              icon={<PackageMinus size={18} />}
              label={tActions('stock_out')}
              onClick={() => { setShowMore(false); router.push(`/stock/out?product=${id}`); }}
            />
          )}
          <ActionRow
            icon={<Camera size={18} />}
            label={product.primary_image ? tActions('replace_photo') : tActions('add_photo')}
            description={tActions('photo_helper')}
            onClick={() => { setShowMore(false); fileInputRef.current?.click(); }}
          />
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          {product.is_active ? (
            <ActionRow
              icon={<PowerOff size={18} />}
              label={tActions('deactivate')}
              description={tActions('deactivate_helper')}
              onClick={async () => { setShowMore(false); await handleDeactivate(); }}
              disabled={deactivate.isPending}
              tone="danger"
            />
          ) : (
            <ActionRow
              icon={<Power size={18} />}
              label={tActions('reactivate')}
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
        <HeroCard
          product={product}
          onPickPhoto={() => fileInputRef.current?.click()}
          onShowMore={() => setShowMore(true)}
          uploading={uploadImage.isPending}
          uploadError={uploadError}
        />

        <StatsGrid product={product} />

        <VariantsManager product={product} />

        {product.description && (
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('description_heading')}
              </h2>
            </div>
            <p className="text-sm text-foreground whitespace-pre-line">{product.description}</p>
          </div>
        )}
      </div>
    </>
  );
}

