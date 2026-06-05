'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';

interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  outputSize?: number;
  quality?: number;
}

export function ImageCropDialog({
  open,
  file,
  onClose,
  onConfirm,
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
      outputSize={outputSize}
      quality={quality}
    />
  );
}

interface CropEditorProps {
  file: File;
  onClose: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  outputSize: number;
  quality: number;
}

function CropEditor({ file, onClose, onConfirm, outputSize, quality }: CropEditorProps) {
  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedArea) return;
    setBusy(true);
    try {
      const blob = await renderCroppedBlob(imageUrl, croppedArea, outputSize, quality);
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
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
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
              disabled={busy || !croppedArea}
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
  outputSize: number,
  quality: number,
): Promise<Blob> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context indisponible');
  ctx.drawImage(
    image,
    area.x, area.y, area.width, area.height,
    0, 0, outputSize, outputSize,
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
