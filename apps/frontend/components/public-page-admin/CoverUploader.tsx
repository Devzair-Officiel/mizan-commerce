'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import {
  type PublicPage,
  useDeletePageCover,
  useUploadPageCover,
} from '@/lib/hooks/usePublicPageAdmin';

interface Props {
  page: PublicPage;
}

export function CoverUploader({ page }: Props) {
  const upload = useUploadPageCover();
  const remove = useDeletePageCover();
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
    if (!confirm('Supprimer la couverture ?')) return;
    try {
      await remove.mutateAsync();
    } catch {
      setError('Erreur lors de la suppression.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-muted-foreground px-1">Bannière</span>
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
        {page.cover_url ? (
          <Image
            src={page.cover_url}
            alt="Bannière"
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
          {upload.isPending ? 'Envoi…' : page.cover_url ? 'Changer' : 'Ajouter une bannière'}
        </Button>
        {page.cover_url && (
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
    </div>
  );
}
