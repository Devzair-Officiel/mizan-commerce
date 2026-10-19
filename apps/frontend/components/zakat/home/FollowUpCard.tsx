'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { useZakatFollowUps } from '@/lib/hooks/useZakatFollowUps';
import { FollowUpRow } from '../followup/FollowUpRow';
import { useFollowUpRun } from '../followup/useFollowUpRun';

const noop = () => {};

/** « À verser à l'encaissement » : choix D4 à faire et zakat à verser ; rien d'affiché s'il n'y a rien à faire. */
export function FollowUpCard() {
  const t = useTranslations('zakat.followup');
  const { data: items } = useZakatFollowUps();
  const { run, pending } = useFollowUpRun();
  if (!items || items.length === 0) return null;

  return (
    <SectionCard title={t('home_title')} description={t('home_hint')}>
      <ul>
        {items.map((item) => (
          <FollowUpRow key={`${item.calculation_id}:${item.line_id}`} item={item} run={run} pending={pending} full={false} onCollect={noop} />
        ))}
      </ul>
    </SectionCard>
  );
}
