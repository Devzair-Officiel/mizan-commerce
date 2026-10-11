'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { INVOICE_TYPES } from './invoiceFile';

interface InvoicePhotoInputProps {
  onFile: (file: File) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** Bouton qui ouvre l'appareil photo (mobile) ou le choix d'un fichier : JPEG, PNG ou WebP. */
export function InvoicePhotoInput({ onFile, disabled, className, children }: InvoicePhotoInputProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:ring-3 has-focus-visible:ring-primary/30', className)}>
      <input id={id} type="file" accept={INVOICE_TYPES.join(',')} capture="environment" disabled={disabled} className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }} />
      {children}
    </label>
  );
}
