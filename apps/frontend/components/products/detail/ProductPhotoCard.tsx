'use client';

import { useRef, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Camera, ImageIcon } from 'lucide-react';
import { PRODUCT_PHOTO_MAX_BYTES, PRODUCT_PHOTO_TYPES } from '@/components/products/form/ProductPhotoSection';
import { useUploadProductImage, type ProductDetail } from '@/lib/hooks/useProducts';
import { notify } from '@/lib/notify';

/** Photo de l'article (4/3) ; l'ajout ou le remplacement s'enregistre tout de suite. */
export function ProductPhotoCard({ product }: { product: ProductDetail }) {
  const t = useTranslations('articles.sheet');
  const tForm = useTranslations('articles.form');
  const upload = useUploadProductImage(product.id);
  const input = useRef<HTMLInputElement>(null);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(PRODUCT_PHOTO_TYPES as readonly string[]).includes(file.type)) { notify.error(tForm('photo_format')); return; }
    if (file.size > PRODUCT_PHOTO_MAX_BYTES) { notify.error(tForm('photo_too_heavy')); return; }
    upload.mutate(file, {
      onSuccess: () => notify.success(t('photo_saved')),
      onError: () => notify.error(t('photo_failed')),
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative grid aspect-4/3 place-items-center bg-muted">
        {product.primary_image ? (
          <Image src={product.primary_image} alt={product.name} fill unoptimized sizes="(min-width: 1024px) 25rem, 100vw" className="object-cover" />
        ) : (
          <ImageIcon size={40} strokeWidth={1.5} className="text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5">
        <p className="text-xs text-muted-foreground">{tForm('photo_help')}</p>
        <button type="button" onClick={() => input.current?.click()} disabled={upload.isPending}
          className="inline-flex shrink-0 items-center gap-1.5 text-[0.8125rem] font-semibold text-primary hover:underline focus-visible:underline focus-visible:outline-none disabled:opacity-50">
          <Camera size={14} aria-hidden />
          {upload.isPending ? t('photo_sending') : product.primary_image ? tForm('photo_change') : tForm('photo_choose')}
        </button>
      </div>
      <input ref={input} type="file" accept={PRODUCT_PHOTO_TYPES.join(',')} className="hidden" onChange={onChange} tabIndex={-1} aria-hidden />
    </div>
  );
}
