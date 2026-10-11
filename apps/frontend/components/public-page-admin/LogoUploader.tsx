'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import {
  type PublicPage,
  useDeletePageLogo,
  useUploadPageLogo,
} from '@/lib/hooks/usePublicPageAdmin';
import { ConfirmDialog } from '@/components/ui/dialog';

interface Props {
  page: PublicPage;
}

export function LogoUploader({ page }: Props) {
  const t = useTranslations('public_page_admin');
  const upload = useUploadPageLogo();
  const remove = useDeletePageLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handlePickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(t('uploader.formats'));
      return;
    }
    setPendingFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    try {
      await upload.mutateAsync(blob);
      setPendingFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('uploader.upload_error'));
    }
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync();
    } catch {
      setError(t('uploader.delete_error'));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-muted-foreground px-1">{t('logo.label')}</span>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
          {page.logo_url ? (
            <Image
              src={page.logo_url}
              alt={t('logo.label')}
              width={80}
              height={80}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl font-bold text-muted-foreground">
              {(page.display_name || '?').trim().charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePickFile}
            disabled={upload.isPending}
          >
            {upload.isPending ? t('uploader.sending') : page.logo_url ? t('logo.change') : t('logo.add')}
          </Button>
          {page.logo_url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending}
            >
              {remove.isPending ? t('uploader.deleting') : t('uploader.delete')}
            </Button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      {error && <p className="text-[11px] text-destructive px-1">{error}</p>}

      <ImageCropDialog
        open={!!pendingFile}
        file={pendingFile}
        onClose={() => setPendingFile(null)}
        onConfirm={handleCropConfirm}
        aspect={1}
        outputSize={512}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('logo.confirm_delete')}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel={t('uploader.delete')}
      />
    </div>
  );
}
