'use client';

import { useTranslations } from 'next-intl';
import { OptionRadio } from '../../choice/OptionRadio';
import type { Metal } from './assetForm';

interface MetalFieldsProps {
  metal: Metal | null;
  counted: boolean | null;
  onMetal: (metal: Metal) => void;
  onCounted: (counted: boolean) => void;
  errors: { metal?: string; counted?: string };
}

/**
 * « Or et argent » (Q8) : lingots et pièces, comptés par défaut ; bijoux portés, à compter ou non
 * au choix de la personne, avec le repère des écoles (D7).
 */
export function MetalFields({ metal, counted, onMetal, onCounted, errors }: MetalFieldsProps) {
  const t = useTranslations('zakat.steps.other');
  return (
    <>
      <OptionRadio label={t('metal_question')} value={metal} onChange={onMetal} error={errors.metal} options={[
        { value: 'bullion', title: t('metal_bullion'), text: t('metal_bullion_text') },
        { value: 'jewelry', title: t('metal_jewelry'), text: t('metal_jewelry_text') },
      ]} />
      {metal === 'jewelry' && (
        <OptionRadio label={t('jewelry_question')} help={t('marker.jewelry.text')} error={errors.counted}
          value={counted === null ? null : counted ? 'count' : 'skip'}
          onChange={(value) => onCounted(value === 'count')}
          options={[{ value: 'count', title: t('jewelry_count') }, { value: 'skip', title: t('jewelry_skip') }]} />
      )}
    </>
  );
}
