'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Minus } from 'lucide-react';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { PlanChangePreview } from '@/lib/hooks/useBilling';
import { SHIPPED_FEATURES } from '@/lib/plan-features';

/**
 * Descente de formule : fonctions livrées perdues (« Vous perdez »), puis plafonds déjà dépassés.
 * Perte de l'équipe (`multi_user`) avec des membres en plus du propriétaire : la phrase sur leur
 * accès suspendu remplace la ligne générique des membres. Rien si rien ne se perd.
 */
export function PlanChangeLosses({ preview }: { preview: PlanChangePreview }) {
  const t = useTranslations('settings.subscription');
  const kind = useCatalogKind();
  const features = preview.lost_features.filter((key) => SHIPPED_FEATURES.has(key) && t.has(`features.${key}`));
  const team = preview.lost_features.includes('multi_user') && preview.over_limits.some((over) => over.resource === 'members');
  const limits = preview.over_limits.filter((over) => !(team && over.resource === 'members'));
  if (features.length === 0 && !team && limits.length === 0) return null;

  return (
    <div className="flex flex-col gap-3" data-plan-change-losses>
      {features.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground">{t('change.losses_title')}</p>
          <ul className="flex flex-col gap-1.5" data-lost-features={features.join(',')}>
            {features.map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm text-foreground">
                <Minus size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <span>{t(`features.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(team || limits.length > 0) && (
        <ul className="flex flex-col gap-2">
          {team && <LossLine data="members_suspended" text={t('change.members_suspended')} />}
          {limits.map((over) => (
            <LossLine key={over.resource} data={over.resource}
              text={t('change.over_limit', { resource: over.resource, usage: over.usage, limit: over.limit, kind })} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LossLine({ data, text }: { data: string; text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400" data-over-limit={data}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span className="tabular-nums">{text}</span>
    </li>
  );
}
