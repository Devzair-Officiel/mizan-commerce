'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SectionCard } from '@/components/ui/SectionCard';
import { cn } from '@/lib/utils';
import { BasisLink } from '../../basis/BasisLink';
import { useOpenBasis } from '../../basis/BasisProvider';

const MARKERS = ['real_estate', 'jewelry', 'for_resale'] as const;

function MarkerList({ inset }: { inset: boolean }) {
  const t = useTranslations('zakat.steps.other.marker');
  return (
    <dl>
      {MARKERS.map((key) => (
        <div key={key} className={cn('grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 border-b border-border py-3 text-[0.84375rem] leading-normal last:border-b-0', inset ? 'px-5' : 'first:pt-0 last:pb-0')}>
          <dt className="font-semibold text-foreground">{t(`${key}.title`)}</dt>
          <dd className="text-foreground">{t(`${key}.text`)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Repères pour décider (immobilier, bijoux, biens à revendre) : carte sur desktop, lien et feuille sur mobile.
 * « Voir les sources » ouvre la fiche Fondement ; sur mobile, la feuille des repères se ferme d'abord (une seule feuille à la fois).
 */
export function AssetMarkers() {
  const t = useTranslations('zakat.steps.other');
  const tb = useTranslations('zakat.basis');
  const openBasis = useOpenBasis();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="max-lg:hidden">
        <SectionCard title={t('markers_title')} description={t('markers_hint')}
          rightSlot={<BasisLink view="other" label={tb('see_sources')} icon={false} className="min-h-6 text-[0.8125rem]" />}>
          <MarkerList inset />
        </SectionCard>
      </div>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-start text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-primary/30 lg:hidden">
        <Info className="size-4 shrink-0" aria-hidden />
        {t('markers_link')}
      </button>
      {open && (
        <BottomSheet open onClose={() => setOpen(false)} title={t('markers_title')} description={t('markers_hint')}>
          <MarkerList inset={false} />
          {openBasis && (
            <button type="button" aria-haspopup="dialog" onClick={() => { setOpen(false); openBasis('other'); }}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
              <Info className="size-4 shrink-0" aria-hidden />
              {tb('see_sources')}
            </button>
          )}
        </BottomSheet>
      )}
    </>
  );
}
