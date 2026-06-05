import { useTranslations } from 'next-intl';
import { Package, Sparkles } from 'lucide-react';
import type { ProductType } from '@/lib/hooks/useProducts';

export function TypeHero({ type }: { type: ProductType }) {
  const t = useTranslations('articles.form');
  const isProduct = type === 'product';
  const Icon = isProduct ? Package : Sparkles;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon size={20} className="text-primary" />
      </div>
      <div className="flex flex-col">
        <p className="text-sm font-semibold text-foreground">
          {isProduct ? t('type_product_title') : t('type_service_title')}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {isProduct ? t('type_product_subtitle') : t('type_service_subtitle')}
        </p>
      </div>
    </div>
  );
}
