'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import {
  type PublicPage,
  useDeletePageLogo,
  useUploadPageLogo,
} from '@/lib/hooks/usePublicPageAdmin';

interface Props {
  page: PublicPage;
}

export function LogoUploader({ page }: Props) {
  const upload = useUploadPageLogo();
  const remove = useDeletePageLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handlePickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Formats acceptés : JPEG, PNG, WebP.');
      return;
    }
    setPendingFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    try {
      await upload.mutateAsync(blob);
      setPendingFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer le logo ?')) return;
    try {
      await remove.mutateAsync();
    } catch {
      setError('Erreur lors de la suppression.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-muted-foreground px-1">Logo</span>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
          {page.logo_url ? (
            <Image
              src={page.logo_url}
              alt="Logo"
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
            {upload.isPending ? 'Envoi…' : page.logo_url ? 'Changer le logo' : 'Ajouter un logo'}
          </Button>
          {page.logo_url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Suppression…' : 'Supprimer'}
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
    </div>
  );
}
