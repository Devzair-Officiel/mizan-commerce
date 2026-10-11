'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DetailPrimaryButton } from '@/components/detail/DetailPrimaryButton';
import { DETAIL_COLUMN, DETAIL_GRID, DetailSlot } from '@/components/detail/DetailSlot';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { TopBar } from '@/components/layout/TopBar';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { useShop } from '@/lib/hooks/useShop';
import { ProductDescriptionCard } from './ProductDescriptionCard';
import { ProductDetailDialogs } from './ProductDetailDialogs';
import { ProductDetailHeader } from './ProductDetailHeader';
import { ProductFormatsCard } from './ProductFormatsCard';
import { ProductMovementsCard } from './ProductMovementsCard';
import { ProductPhotoCard } from './ProductPhotoCard';
import { ProductPricesCard } from './ProductPricesCard';
import { ProductReferencesCard } from './ProductReferencesCard';
import { ProductSalesCard } from './ProductSalesCard';
import { ProductStatusBadge } from './ProductStatusBadge';
import { ProductStockCard } from './ProductStockCard';
import { useProductActions } from './useProductActions';
import { useProductDetailState } from './useProductDetailState';

/**
 * Fiche article. Desktop : formats et derniers mouvements à gauche ; photo, stock et références à droite.
 * Service : prix et ventes, sans stock. Mobile : une seule pile, action principale flottante.
 */
export function ProductDetailView({ product }: { product: ProductDetail }) {
  const t = useTranslations('articles.list');
  const router = useRouter();
  const kind = useCatalogKind();
  const currency = useShop().data?.currency ?? 'EUR';
  const state = useProductDetailState(product);
  const { primary, menu } = useProductActions(product, state.actions);
  const isArticle = product.type === 'product';
  const back = () => (window.history.length > 1 ? router.back() : router.push('/products'));

  return (
    <>
      <div className="contents lg:hidden">
        <TopBar back hideSearch title={product.name} action={<DetailActionsMenu actions={menu} variant="sheet" />} />
      </div>
      <ProductDetailHeader product={product} backLabel={t('title', { kind })} onBack={back} primary={primary} menu={menu} />
      <div className={`flex flex-col gap-4 p-4 lg:pt-5 ${primary ? 'pb-28' : ''} lg:pb-8`}>
        <ProductStatusBadge product={product} className="self-start lg:hidden" />
        <div className={DETAIL_GRID}>
          <div className={DETAIL_COLUMN}>
            <DetailSlot order="max-lg:order-2">
              {isArticle
                ? <ProductFormatsCard product={product} currency={currency} actions={state.actions} />
                : <ProductPricesCard product={product} currency={currency} actions={state.actions} />}
            </DetailSlot>
            <DetailSlot order="max-lg:order-4">{isArticle && <ProductMovementsCard productId={product.id} />}</DetailSlot>
            <DetailSlot order="max-lg:order-6">{product.description && <ProductDescriptionCard description={product.description} />}</DetailSlot>
          </div>
          <div className={`${DETAIL_COLUMN} lg:sticky lg:top-6`}>
            <DetailSlot order="max-lg:order-5"><ProductPhotoCard product={product} /></DetailSlot>
            <DetailSlot order="max-lg:order-1">
              {isArticle ? <ProductStockCard product={product} currency={currency} /> : <ProductSalesCard product={product} currency={currency} />}
            </DetailSlot>
            <DetailSlot order="max-lg:order-3">{isArticle && <ProductReferencesCard product={product} currency={currency} />}</DetailSlot>
          </div>
        </div>
      </div>
      {primary && (
        <FloatingActionBar variant="button">
          <DetailPrimaryButton action={primary} className="h-12 w-full shadow-lg" />
        </FloatingActionBar>
      )}
      <ProductDetailDialogs product={product} state={state} currency={currency} />
    </>
  );
}
