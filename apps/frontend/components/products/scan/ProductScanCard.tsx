'use client';

import { useId, useState, type ReactNode } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useProductScan, type ProductScan, type ScanOutcome } from '@/lib/hooks/useProductScan';
import { ProductScanStatus } from './ProductScanStatus';

interface ProductScanCardProps {
  /** Applique les propositions (champs encore vides seulement) et dit ce qui a été rempli. */
  onScanned: (scan: ProductScan) => ScanOutcome;
  className?: string;
}

/** Ouvre l'appareil photo ou la galerie en un seul geste (`capture`), pour une seule image. */
function ScanPhotoInput({ onFile, disabled, className, children }: { onFile: (file: File) => void; disabled: boolean; className: string; children: ReactNode }) {
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

/**
 * « Scanner l'emballage » (URS-109) : une photo, lue par le serveur (code-barres, texte, secours
 * vision), dont les propositions pré-remplissent ce qui est encore vide. Rien n'est enregistré :
 * le commerçant relit et valide. Réutilisable hors du formulaire article (onboarding). Encadré
 * d'action comme l'invitation à envoyer une facture, pas une carte du gabarit (ni bande ni titre h2).
 */
export function ProductScanCard({ onScanned, className }: ProductScanCardProps) {
  const t = useTranslations('articles.scan');
  const scan = useProductScan();
  const [file, setFile] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);

  const send = (photo: File) => {
    setFile(photo);
    setOutcome(null);
    scan.mutate(photo, { onSuccess: (data) => setOutcome(onScanned(data)) });
  };

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center gap-3 p-4 lg:px-5">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <ScanLine size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-[0.9375rem] font-semibold text-foreground">{t('title')}</p>
          <p className="text-[0.8125rem] text-muted-foreground">{t('help')}</p>
        </div>
        <ScanPhotoInput onFile={send} disabled={scan.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:opacity-90 active:scale-95 max-sm:w-full">
          <Camera size={17} aria-hidden />{t(outcome || scan.isError ? 'scan_again' : 'scan')}
        </ScanPhotoInput>
      </div>
      <ProductScanStatus pending={scan.isPending} failure={scan.error?.reason ?? null} outcome={outcome}
        warnings={outcome ? scan.data?.warnings ?? [] : []} onRetry={file ? () => send(file) : undefined} />
    </div>
  );
}
