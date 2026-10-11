'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ImageIcon } from 'lucide-react';
import type { ProductDetail } from '@/lib/hooks/useProducts';

/** Photo carrée de l'article et miniatures (la principale entourée) ; elles se gèrent dans le formulaire. */
export function ProductPhotoCard({ product }: { product: ProductDetail }) {
  const t = useTranslations('articles.sheet');
  const images = [...product.images].sort((a, b) => a.position - b.position);
  const main = images.find((i) => i.is_primary) ?? images[0];

  return (
    <section aria-label={t('photos')} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4">
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl border border-border bg-muted">
        {main?.url ? (
          <Image src={main.url} alt={product.name} fill unoptimized loading="eager" sizes="(min-width: 1024px) 24rem, 100vw" className="object-cover" />
        ) : (
          <ImageIcon size={40} strokeWidth={1.5} className="text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        {images.length > 1 ? (
          <div aria-hidden className="flex min-w-0 flex-wrap gap-1.5">
            {images.map((image) => (
              <span key={image.id}
                className={`relative size-11 overflow-hidden rounded-lg bg-muted ${image.id === main?.id ? 'border-2 border-primary' : 'border border-border'}`}>
                {image.url && <Image src={image.url} alt="" fill unoptimized loading="eager" sizes="2.75rem" className="object-cover" />}
              </span>
            ))}
          </div>
        ) : <span />}
        <Link href={`/products/${product.id}/edit?focus=photos`}
          className="shrink-0 text-[0.8125rem] font-semibold text-primary underline-offset-4 hover:underline">
          {t(images.length ? 'photos_manage' : 'photos_add')}
        </Link>
      </div>
    </section>
  );
}
