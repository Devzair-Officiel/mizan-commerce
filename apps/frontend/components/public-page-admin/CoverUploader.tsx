'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import {
  type PublicPage,
  useDeletePageCover,
  useUploadPageCover,
} from '@/lib/hooks/usePublicPageAdmin';
import { ConfirmDialog } from '@/components/ui/dialog';

interface Props {
  page: PublicPage;
}

export function CoverUploader({ page }: Props) {
  const t = useTranslations('public_page_admin');
  const upload = useUploadPageCover();
  const remove = useDeletePageCover();
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
      <span className="text-[11px] text-muted-foreground px-1">{t('cover.label')}</span>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
        {page.cover_url ? (
          <Image
            src={page.cover_url}
            alt={t('cover.label')}
            fill
            unoptimized
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 640px"
          />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePickFile}
          disabled={upload.isPending}
        >
          {upload.isPending ? t('uploader.sending') : page.cover_url ? t('cover.change') : t('cover.add')}
        </Button>
        {page.cover_url && (
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
        aspect={16 / 9}
        outputSize={1280}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('cover.confirm_delete')}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel={t('uploader.delete')}
      />
    </div>
  );
}
