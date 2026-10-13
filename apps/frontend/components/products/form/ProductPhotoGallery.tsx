'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ImagePlus, Plus } from 'lucide-react';
import type { ProductPhotos } from './useProductPhotos';

/**
 * Image carrée recadrée au centre ; le fond `bg-muted` du cadre reste visible pendant le chargement.
 * Chargée tout de suite : la grande photo est en haut de la page, et sa miniature partage son adresse.
 */
function PhotoImage({ url }: { url: string | null }) {
  return url ? <Image src={url} alt="" fill unoptimized loading="eager" className="object-cover" /> : null;
}

interface ProductPhotoGalleryProps {
  photos: ProductPhotos;
  /** Faux quand l'article a déjà le nombre maximal de photos. */
  canAdd: boolean;
  onAdd: () => void;
}

/** Grande photo principale carrée, miniatures dessous (la principale entourée) et case « + ». */
export function ProductPhotoGallery({ photos, canAdd, onAdd }: ProductPhotoGalleryProps) {
  const t = useTranslations('articles.form');
  const { items, main } = photos;
  const focus = 'outline-none focus-visible:ring-3 focus-visible:ring-primary/30';

  if (!main) {
    return (
      <button type="button" onClick={onAdd}
        className={`flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ${focus}`}>
        <ImagePlus size={24} strokeWidth={1.75} aria-hidden />
        {t('photo_add')}
      </button>
    );
  }
  return (
    <>
      <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
        <PhotoImage url={main.url} />
        <span className="absolute inset-s-2.5 top-2.5 inline-flex h-6 items-center rounded-full bg-black/55 px-2.5 text-xs font-semibold text-white">
          {t('photo_main')}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item, index) => {
          const isMain = item.key === main.key;
          return (
            <button key={item.key} type="button" aria-pressed={isMain} aria-label={t('photo_thumb', { index: index + 1 })}
              onClick={() => photos.setPrimary(item.key)}
              className={`relative aspect-square overflow-hidden rounded-lg bg-muted ${isMain ? 'border-2 border-primary' : 'border border-border'} ${focus}`}>
              <PhotoImage url={item.url} />
            </button>
          );
        })}
        {canAdd && (
          <button type="button" aria-label={t('photo_add')} onClick={onAdd}
            className={`flex aspect-square items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${focus}`}>
            <Plus size={18} aria-hidden />
          </button>
        )}
      </div>
    </>
  );
}
