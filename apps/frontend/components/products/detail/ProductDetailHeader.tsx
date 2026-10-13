'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Pencil } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import { DetailPrimaryButton } from '@/components/detail/DetailPrimaryButton';
import type { DetailAction, DetailMenuActions } from '@/components/detail/types';
import { buttonVariants } from '@/components/ui/button';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';
import { ProductStatusBadge } from './ProductStatusBadge';
import { useProductSubtitle } from './useProductSubtitle';

interface ProductDetailHeaderProps {
  product: ProductDetail;
  backLabel: string;
  onBack: () => void;
  primary: DetailAction | null;
  menu: DetailMenuActions;
}

/** En-tête desktop : retour, nom + badge d'état, type et date ; à droite Modifier, « ⋯ », action principale. */
export function ProductDetailHeader({ product, backLabel, onBack, primary, menu }: ProductDetailHeaderProps) {
  const t = useTranslations('articles.sheet');
  const subtitle = useProductSubtitle(product);

  return (
    <header className="hidden flex-wrap items-end justify-between gap-4 px-4 pt-2 lg:flex">
      <div className="min-w-0">
        <button type="button" onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />
          {backLabel}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 dir="auto" className="text-[28px] font-semibold leading-snug tracking-tight">{product.name}</h1>
          <ProductStatusBadge product={product} />
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/products/${product.id}/edit`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-full bg-card px-4 font-medium')}>
          <Pencil aria-hidden />{t('edit')}
        </Link>
        <DetailActionsMenu actions={menu} variant="menu" />
        {primary && <DetailPrimaryButton action={primary} />}
      </div>
    </header>
  );
}
