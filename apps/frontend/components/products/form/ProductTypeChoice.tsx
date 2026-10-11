'use client';

import type { UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Package, Sparkles } from 'lucide-react';
import type { ProductFormValues } from './useProductForm';

const CHOICES = [
  { value: 'product', icon: Package, label: 'type_product', help: 'type_product_help' },
  { value: 'service', icon: Sparkles, label: 'type_service', help: 'type_service_help' },
] as const;

/** Article ou service, à la création en boutique mixte : deux cartes radio côte à côte. */
export function ProductTypeChoice({ register }: { register: UseFormRegister<ProductFormValues> }) {
  const t = useTranslations('articles.form');
  return (
    <fieldset className="col-span-full flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[0.8125rem] font-medium text-foreground">{t('type')}</legend>
      <div className="grid grid-cols-2 gap-3">
        {CHOICES.map(({ value, icon: Icon, label, help }) => (
          <label key={value}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-primary/20">
            <input type="radio" value={value} {...register('type')} className="sr-only" />
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground" aria-hidden>
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{t(label)}</span>
              <span className="block text-xs text-muted-foreground">{t(help)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
