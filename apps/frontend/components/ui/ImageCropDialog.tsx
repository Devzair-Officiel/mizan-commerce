'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';

interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  /** Ratio largeur/hauteur de la zone de crop. Défaut 1 (carré). */
  aspect?: number;
  /** Dimension du plus long côté en sortie. Défaut 512. */
  outputSize?: number;
  quality?: number;
}

export function ImageCropDialog({
  open,
  file,
  onClose,
  onConfirm,
  aspect = 1,
  outputSize = 512,
  quality = 0.85,
}: ImageCropDialogProps) {
  if (!open || !file) return null;
  return (
    <CropEditor
      key={`${file.name}-${file.size}-${file.lastModified}`}
      file={file}
      onClose={onClose}
      onConfirm={onConfirm}
      aspect={aspect}
      outputSize={outputSize}
      quality={quality}
    />
  );
}

interface CropEditorProps {
  file: File;
  onClose: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  aspect: number;
  outputSize: number;
  quality: number;
}

function CropEditor({ file, onClose, onConfirm, aspect, outputSize, quality }: CropEditorProps) {
  // On gère blob URL via useEffect plutôt que useMemo : React Strict Mode (dev)
  // double-invoque le mount, et un useMemo + cleanup d'useEffect révoquerait
  // l'URL entre les deux passes — le Cropper affiche alors une image cachée
  // mais loadImage échoue au moment du crop final (ERR_FILE_NOT_FOUND).
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedArea || !imageUrl) return;
    setBusy(true);
    try {
      const blob = await renderCroppedBlob(imageUrl, croppedArea, aspect, outputSize, quality);
      await onConfirm(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-80 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex flex-1 flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex-1 bg-black">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape="rect"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="bg-card border-t border-border p-4 flex flex-col gap-3 pb-safe">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary"
              aria-label="Zoom"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={onClose}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleConfirm}
              disabled={busy || !croppedArea || !imageUrl}
            >
              {busy ? 'Traitement…' : 'Valider'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function renderCroppedBlob(
  imageUrl: string,
  area: Area,
  aspect: number,
  outputSize: number,
  quality: number,
): Promise<Blob> {
  const image = await loadImage(imageUrl);
  // outputSize est le plus long côté ; l'autre est déduit du ratio.
  const outW = aspect >= 1 ? outputSize : Math.round(outputSize * aspect);
  const outH = aspect >= 1 ? Math.round(outputSize / aspect) : outputSize;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context indisponible');
  ctx.drawImage(
    image,
    area.x, area.y, area.width, area.height,
    0, 0, outW, outH,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob a renvoyé null'))),
      'image/jpeg',
      quality,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
