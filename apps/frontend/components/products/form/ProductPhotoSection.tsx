'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Crop, ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import { FormSection } from '@/components/form/FormSection';
import { notify } from '@/lib/notify';
import { ProductPhotoGallery } from './ProductPhotoGallery';
import { fetchPhotoFile, PRODUCT_PHOTO_MAX_COUNT, type ProductPhotos } from './useProductPhotos';

/** Mêmes types que le serveur (`PRODUCT_IMAGE_ALLOWED_TYPES`). */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface ProductPhotoSectionProps {
  photos: ProductPhotos;
  /** En modification : article dont on recadre les photos enregistrées. */
  productId?: string;
  open: boolean;
  onToggle: () => void;
  order: string;
}

/**
 * Photos (facultatives), au format carré : chaque image choisie passe par le recadrage 1:1 avant
 * d'être ajoutée ; « Recadrer » et « Retirer » agissent sur la photo principale. Tout est envoyé
 * à l'enregistrement du formulaire.
 */
export function ProductPhotoSection({ photos, productId, open, onToggle, order }: ProductPhotoSectionProps) {
  const t = useTranslations('articles.form');
  const input = useRef<HTMLInputElement>(null);
  // Image à recadrer : nouvelle (`key` nul) ou photo existante à recadrer à nouveau.
  const [crop, setCrop] = useState<{ key: string | null; file: File } | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const { main, items } = photos;

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const valid = PHOTO_TYPES.includes(file.type);
    setError(valid ? undefined : t('photo_format'));
    if (valid) setCrop({ key: null, file });
  }

  async function recrop() {
    if (!main) return;
    if (main.source) {
      setCrop({ key: main.key, file: main.source });
      return;
    }
    if (!main.id || !productId) return;
    setLoading(true);
    try {
      setCrop({ key: main.key, file: await fetchPhotoFile(productId, main.id) });
    } catch {
      notify.error(t('photo_load_failed'));
    } finally {
      setLoading(false);
    }
  }

  function confirm(blob: Blob) {
    if (!crop) return;
    const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    if (crop.key) photos.replace(crop.key, file, crop.file);
    else photos.add(file, crop.file);
    setCrop(null);
  }

  const action = 'h-8.5 gap-1.5 rounded-full bg-card px-3 text-[0.8125rem] font-medium';
  return (
    <FormSection id="photos" icon={ImageIcon} order={order} title={t('section_photo')} status="optional"
      collapse={{ open, onToggle, summary: items.length ? t('photo_summary', { count: items.length }) : '' }}>
      <ProductPhotoGallery photos={photos} canAdd={items.length < PRODUCT_PHOTO_MAX_COUNT} onAdd={() => input.current?.click()} />
      <input ref={input} type="file" accept={PHOTO_TYPES.join(',')} onChange={pick} hidden />
      {main && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={recrop} disabled={loading} className={action}>
            <Crop size={16} aria-hidden />{t('photo_crop')}
          </Button>
          <Button type="button" variant="outline" onClick={() => photos.remove(main.key)} className={action}>
            <Trash2 size={16} aria-hidden />{t('photo_remove')}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('photo_note')}</p>
      {error && <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
      <ImageCropDialog open={crop !== null} file={crop?.file ?? null} onClose={() => setCrop(null)} onConfirm={confirm} outputSize={1024} />
    </FormSection>
  );
}
