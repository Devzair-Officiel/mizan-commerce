'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Camera, ImageIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';

/** Mêmes limites que le serveur (`PRODUCT_IMAGE_ALLOWED_TYPES`, 5 Mo). */
export const PRODUCT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PRODUCT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

interface ProductPhotoSectionProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** Photo déjà enregistrée (URL signée), remplacée si une nouvelle est choisie. */
  currentUrl: string | null;
  open: boolean;
  onToggle: () => void;
}

/** Photo (facultative) : aperçu, choix ou changement ; envoyée à l'enregistrement du formulaire. */
export function ProductPhotoSection({ file, onChange, currentUrl, open, onToggle }: ProductPhotoSectionProps) {
  const t = useTranslations('articles.form');
  const [error, setError] = useState<string>();
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => (fileUrl ? () => URL.revokeObjectURL(fileUrl) : undefined), [fileUrl]);
  const preview = fileUrl ?? currentUrl;

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    event.target.value = '';
    if (!next) return;
    const problem = !PRODUCT_PHOTO_TYPES.includes(next.type) ? t('photo_format') : next.size > PRODUCT_PHOTO_MAX_BYTES ? t('photo_too_heavy') : undefined;
    setError(problem);
    if (!problem) onChange(next);
  }

  return (
    <FormCollapsibleSection title={t('section_photo')} description={t('section_photo_help')} summary={preview ? t('photo_summary') : ''}
      icon={<ImageIcon size={19} strokeWidth={1.75} />} open={open} onToggle={onToggle}>
      <FormField label={t('photo_label')} help={t('photo_help')} error={error} wide>
        {(c) => (
          <div className="flex items-center gap-4">
            <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-muted-foreground">
              {preview ? <Image src={preview} alt="" width={80} height={80} unoptimized className="size-full object-cover" /> : <Camera size={22} aria-hidden />}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`${buttonVariants({ variant: 'outline' })} h-10 cursor-pointer rounded-full px-4 has-focus-visible:ring-3 has-focus-visible:ring-primary/30`}>
                <input {...c} type="file" accept={PRODUCT_PHOTO_TYPES.join(',')} onChange={pick} className="sr-only" />
                {preview ? t('photo_change') : t('photo_choose')}
              </label>
              {file && (
                <Button type="button" variant="ghost" onClick={() => onChange(null)} className="h-10 rounded-full px-4">
                  {t('photo_cancel')}
                </Button>
              )}
            </div>
          </div>
        )}
      </FormField>
    </FormCollapsibleSection>
  );
}
