'use client';

import { useState } from 'react';
import { Camera, ImagePlus, ScanLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useProductScan, type ProductScan, type ScanOutcome, type ScanPhotos } from '@/lib/hooks/useProductScan';
import { ProductScanStatus } from './ProductScanStatus';
import { ScanPhotoInput } from './ScanPhotoInput';

interface ProductScanCardProps {
  /** Applique les propositions (champs vides, ou encore égaux à la valeur détectée) et dit ce qui a été rempli. */
  onScanned: (scan: ProductScan) => ScanOutcome;
  className?: string;
}

/**
 * « Scanner l'emballage » (URS-109) : la photo de face, lue par le serveur (code-barres, texte,
 * secours vision), puis celle du dos si besoin (code-barres, contenance), renvoyées ensemble. Les
 * propositions pré-remplissent ce qui est encore vide. Rien n'est enregistré : le commerçant relit
 * et valide. Réutilisable hors du formulaire article (onboarding). Encadré d'action comme
 * l'invitation à envoyer une facture, pas une carte du gabarit (ni bande ni titre h2).
 */
export function ProductScanCard({ onScanned, className }: ProductScanCardProps) {
  const t = useTranslations('articles.scan');
  const scan = useProductScan();
  const [photos, setPhotos] = useState<ScanPhotos | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);

  const send = (next: ScanPhotos) => {
    setPhotos(next);
    setOutcome(null);
    scan.mutate(next, { onSuccess: (data) => setOutcome(onScanned(data)) });
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
        <ScanPhotoInput onFile={(face) => send({ face })} disabled={scan.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:opacity-90 active:scale-95 max-sm:w-full">
          <Camera size={17} aria-hidden />{t(outcome || scan.isError ? 'scan_again' : 'scan')}
        </ScanPhotoInput>
      </div>
      <ProductScanStatus pending={scan.isPending} failure={scan.error?.reason ?? null} outcome={outcome}
        warnings={outcome ? scan.data?.warnings ?? [] : []} onRetry={photos ? () => send(photos) : undefined} />
      {outcome && photos && !photos.back && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-3 lg:px-5">
          <p className="min-w-0 flex-1 basis-56 text-[0.8125rem] text-muted-foreground">{t('back_hint')}</p>
          <ScanPhotoInput onFile={(back) => send({ face: photos.face, back })} disabled={scan.isPending}
            className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-transform hover:bg-muted active:scale-95 max-sm:w-full">
            <ImagePlus size={16} aria-hidden />{t('add_back')}
          </ScanPhotoInput>
        </div>
      )}
    </div>
  );
}
