'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFormatShopDate } from '@/lib/hooks/useFormat';
import { notify } from '@/lib/notify';
import { FOLLOWUP_DATE, type FollowupConflict } from './useFollowupReminder';

/** Un rappel de relance existe déjà pour ce client : le décaler (choix principal) ou en créer un second. */
export function FollowupReminderDialog({ conflict }: { conflict: FollowupConflict | null }) {
  const t = useTranslations('reminders.followup');
  const formatDate = useFormatShopDate();
  const [busy, setBusy] = useState(false);
  // Le texte reste affiché pendant l'animation de fermeture.
  const [shown, setShown] = useState(conflict);
  if (conflict && conflict !== shown) setShown(conflict);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch {
      notify.error(t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={conflict !== null} onOpenChange={(open) => { if (!open && !busy) conflict?.close(); }} disablePointerDismissal={busy}>
      <DialogContent>
        {shown && (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('exists', {
                  name: shown.customerName,
                  date: formatDate(shown.currentDue, FOLLOWUP_DATE),
                  newDate: formatDate(shown.newDue, FOLLOWUP_DATE),
                })}
              </DialogTitle>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={shown.close}>{t('cancel')}</Button>
              <Button variant="outline" disabled={busy} onClick={() => run(shown.createAnyway)}>{t('create_anyway')}</Button>
              <Button disabled={busy} onClick={() => run(shown.postpone)}>{busy ? '…' : t('postpone')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
