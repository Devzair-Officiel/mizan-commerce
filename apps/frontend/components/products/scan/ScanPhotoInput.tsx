'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScanPhotoInputProps {
  onFile: (file: File) => void;
  disabled: boolean;
  className: string;
  children: ReactNode;
}

/** Ouvre l'appareil photo ou la galerie en un seul geste (`capture`), pour une seule image. */
export function ScanPhotoInput({ onFile, disabled, className, children }: ScanPhotoInputProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:ring-3 has-focus-visible:ring-primary/30', className)}>
      <input id={id} type="file" accept="image/*" capture="environment" disabled={disabled} className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }} />
      {children}
    </label>
  );
}
