'use client';

import { useTranslations } from 'next-intl';
import { notify } from '@/lib/notify';
import {
  followUpConflictOf, useFollowUpAction, type FollowUpAction, type FollowUpItem, type FollowUpRevert,
} from '@/lib/hooks/useZakatFollowUps';

/** Gestes qui se défont depuis la notification (« Annuler »). */
const UNDO: Partial<Record<FollowUpAction['action'], FollowUpRevert>> = { paid: 'paid', ignore: 'ignore', collected: 'collected' };

export type RunFollowUp = (item: FollowUpItem, action: FollowUpAction, onDone?: () => void) => void;

/**
 * Envoi d'une action sur une créance suivie, à appeler dans la carte (qui reste montée quand la
 * créance quitte la liste). Conflit (déjà fait ailleurs, montant recalculé) : la créance est relue
 * et la personne prévenue ; rien n'est rejoué.
 */
export function useFollowUpRun(): { run: RunFollowUp; pending: boolean } {
  const t = useTranslations('zakat.followup');
  const { mutate, isPending } = useFollowUpAction();
  const fail = (error: Error) => notify.error(t(followUpConflictOf(error) ? 'conflict' : 'failed'));
  const run: RunFollowUp = (item, action, onDone) => {
    if (isPending) return;
    mutate({ item, action }, {
      onSuccess: (next) => {
        onDone?.();
        const undo = UNDO[action.action];
        notify.success(
          t(`done.${action.action}`),
          undo ? { label: t('undo'), onClick: () => mutate({ item: next, action: { action: 'revert', revert: undo } }, { onError: fail }) } : undefined,
        );
      },
      onError: fail,
    });
  };
  return { run, pending: isPending };
}
