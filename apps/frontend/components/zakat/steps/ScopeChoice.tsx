'use client';

import { useTranslations } from 'next-intl';
import type { LineScope } from '@/lib/hooks/useZakat';
import { OptionRadio } from '../choice/OptionRadio';

interface ScopeChoiceProps {
  kind: 'receivable' | 'debt';
  value: LineScope | null;
  onChange: (scope: LineScope) => void;
  /** Part de la personne, déjà mise en forme (« 50 »). */
  share: string;
  error?: string;
}

/**
 * Part inférieure à 100 % : la ligne est-elle de la boutique (part appliquée) ou personnelle (comptée
 * en entier) ? Rien de coché d'avance : « Boutique » par défaut réduirait une dette personnelle sans le dire.
 */
export function ScopeChoice({ kind, value, onChange, share, error }: ScopeChoiceProps) {
  const t = useTranslations('zakat.steps.scope');
  return (
    <OptionRadio label={t('label', { kind })} value={value} onChange={onChange} error={error}
      options={[
        { value: 'shop', title: t('shop'), text: t('shop_text', { share }) },
        { value: 'personal', title: t('personal'), text: t('personal_text') },
      ]} />
  );
}
