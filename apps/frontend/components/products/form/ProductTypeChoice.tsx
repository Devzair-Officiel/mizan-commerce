'use client';

import type { UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Package, Sparkles } from 'lucide-react';
import type { ProductFormValues } from './useProductForm';

const CHOICES = [
  { value: 'product', icon: Package, label: 'type_product', help: 'type_product_help' },
  { value: 'service', icon: Sparkles, label: 'type_service', help: 'type_service_help' },
] as const;

/** Article ou service, à la création en boutique mixte : sélecteur compact à deux options. */
export function ProductTypeChoice({ register }: { register: UseFormRegister<ProductFormValues> }) {
  const t = useTranslations('articles.form');
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[0.8125rem] font-medium text-foreground">{t('type')}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {CHOICES.map(({ value, icon: Icon, label, help }) => (
          <label key={value}
            className="group/choice flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground transition-colors has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-primary/30">
            <input type="radio" value={value} {...register('type')} className="sr-only" />
            <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0 group-has-checked/choice:text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t(label)}</span>
              <span className="block text-xs text-muted-foreground">{t(help)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
