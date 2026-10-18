'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OtherAsset } from '@/lib/hooks/useZakat';
import { AssetListCard } from './other/AssetListCard';
import { AssetMarkers } from './other/AssetMarkers';
import { AssetSheet } from './other/AssetSheet';
import { AssetShortcuts } from './other/AssetShortcuts';
import type { AssetKind } from './other/assetForm';
import { PrivateBadge } from './other/PrivateBadge';
import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

/** Ligne ouverte dans la feuille : `index` nul pour un ajout (la catégorie vient du raccourci touché). */
interface SheetTarget {
  index: number | null;
  kind: AssetKind;
}

/** Étape 5 : biens hors boutique, montant libre, chaque ligne comptée ou non au choix de la personne. */
export function OtherStep({ calc, save, format }: StepProps) {
  const t = useTranslations('zakat.steps.other');
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const assets = calc.other_assets;
  const write = (next: OtherAsset[]) => save({ other_assets: next }, true);
  const replace = (index: number, asset: OtherAsset) => write(assets.map((a, i) => (i === index ? asset : a)));
  const remove = (index: number) => write(assets.filter((_, i) => i !== index));
  // En modification, la feuille reprend la catégorie de la ligne : `kind` ne sert qu'à l'ajout.
  const edit = (index: number) => setSheet({ index, kind: 'other' });
  const target = sheet?.index ?? null;

  return (
    <>
      <StepHeading title={t('title')} lead={t('hint_short')}>
        <div className="mt-2"><PrivateBadge /></div>
      </StepHeading>
      <AssetShortcuts onAdd={(kind) => setSheet({ index: null, kind })} />
      <AssetListCard calc={calc} format={format} onEdit={edit} onAdd={() => setSheet({ index: null, kind: 'other' })}
        onToggle={(index, counted) => write(assets.map((a, i) => (i === index ? { ...a, counted } : a)))} />
      <AssetMarkers />
      {sheet && (
        <AssetSheet asset={target === null ? undefined : assets[target]} kind={sheet.kind} format={format}
          onClose={() => setSheet(null)}
          onSubmit={(asset) => (target === null ? write([...assets, asset]) : replace(target, asset))}
          onDelete={target === null ? undefined : () => { remove(target); setSheet(null); }} />
      )}
    </>
  );
}
