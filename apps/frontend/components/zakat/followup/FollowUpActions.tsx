'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { FollowUpItem, FollowUpRevert } from '@/lib/hooks/useZakatFollowUps';
import type { ZakatFormat } from '../useZakatFormat';
import type { RunFollowUp } from './useFollowUpRun';

interface FollowUpActionsProps {
  item: FollowUpItem;
  format: ZakatFormat;
  run: RunFollowUp;
  pending: boolean;
  /** Écran Résultat : « Encaissée » et les retours en arrière, en plus des gestes de l'accueil. */
  full: boolean;
  onCollect: () => void;
}

function RevertLink({ what, onRevert, disabled }: { what: FollowUpRevert; onRevert: () => void; disabled: boolean }) {
  const t = useTranslations('zakat.followup.revert');
  return (
    <p className="text-[0.8125rem] text-muted-foreground">
      {t(what)}{' '}
      <button type="button" onClick={onRevert} disabled={disabled} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline disabled:opacity-50">{t('action')}</button>
    </p>
  );
}

/** Gestes de la personne sur une créance : versée (le reste affiché, rien d'autre), ignorer, encaissée, revenir. */
export function FollowUpActions({ item, format, run, pending, full, onCollect }: FollowUpActionsProps) {
  const t = useTranslations('zakat.followup');
  const actionable = item.state === 'to_pay' || item.state === 'choice_needed';
  const collectable = full && item.state === 'pending' && item.order_id === null;
  const reverts: FollowUpRevert[] = full ? [
    ...(item.can_revert_paid ? ['paid' as const] : []),
    ...(item.state === 'ignored' ? ['ignore' as const] : []),
    ...(item.collected_on ? ['collected' as const] : []),
  ] : [];
  if (!actionable && !collectable && reverts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {(actionable || collectable) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {item.state === 'to_pay' && (
            <p className="me-auto text-sm font-semibold text-foreground tabular-nums">{t('remaining', { amount: format.money(item.remaining) })}</p>
          )}
          {actionable && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(item, { action: 'ignore' })} className="h-11 rounded-full px-4">{t('ignore')}</Button>
          )}
          {item.state === 'to_pay' && (
            <Button type="button" disabled={pending} onClick={() => run(item, { action: 'paid', amount: item.remaining })} className="h-11 rounded-full px-5 font-semibold">{t('mark_paid')}</Button>
          )}
          {collectable && (
            <Button type="button" variant="outline" disabled={pending} onClick={onCollect} className="h-11 rounded-full px-5 font-semibold">{t('collected')}</Button>
          )}
        </div>
      )}
      {reverts.map((what) => (
        <RevertLink key={what} what={what} disabled={pending} onRevert={() => run(item, { action: 'revert', revert: what })} />
      ))}
    </div>
  );
}
