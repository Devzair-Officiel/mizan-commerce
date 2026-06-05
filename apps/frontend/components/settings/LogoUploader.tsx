import { useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/ui/ImageCropDialog';
import { useUploadShopLogo, useDeleteShopLogo, type Shop } from '@/lib/hooks/useShop';

interface LogoUploaderProps {
  shop: Shop | undefined;
}

export function LogoUploader({ shop }: LogoUploaderProps) {
  const uploadLogo = useUploadShopLogo();
  const deleteLogo = useDeleteShopLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  function handlePickFile() {
    setLogoError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setLogoError('Formats acceptés : JPEG, PNG, WebP.');
      return;
    }
    setPendingFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    try {
      await uploadLogo.mutateAsync(blob);
      setPendingFile(null);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Erreur upload');
    }
  }

  async function handleDeleteLogo() {
    if (!confirm('Supprimer le logo de la boutique ?')) return;
    try {
      await deleteLogo.mutateAsync();
    } catch {
      setLogoError('Erreur lors de la suppression.');
    }
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
          {shop?.logo_url ? (
            <Image
              src={shop.logo_url}
              alt="Logo"
              width={80}
              height={80}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl font-bold text-muted-foreground">
              {(shop?.name ?? '?').trim().charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePickFile}
            disabled={uploadLogo.isPending}
          >
            {uploadLogo.isPending ? 'Envoi…' : shop?.logo_url ? 'Changer le logo' : 'Ajouter un logo'}
          </Button>
          {shop?.logo_url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDeleteLogo}
              disabled={deleteLogo.isPending}
            >
              {deleteLogo.isPending ? 'Suppression…' : 'Supprimer'}
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
      {logoError && <p className="text-[11px] text-destructive px-1">{logoError}</p>}

      <ImageCropDialog
        open={!!pendingFile}
        file={pendingFile}
        onClose={() => setPendingFile(null)}
        onConfirm={handleCropConfirm}
      />
    </>
  );
}
