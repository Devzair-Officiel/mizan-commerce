'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCreateZakatCalculation, yearTakenOf } from '@/lib/hooks/useZakat';
import { notify } from '@/lib/notify';
import { stepHref } from '../wizard/stepNav';

/** Création au clic (jour J et choix repris du profil par le serveur) ; année déjà prise : ouvre la fiche existante. */
export function useStartZakat() {
  const t = useTranslations('zakat.home');
  const router = useRouter();
  const create = useCreateZakatCalculation();

  function start() {
    create.mutate({}, {
      onSuccess: (calc) => router.push(stepHref(calc.id, 0)),
      onError: (error) => {
        const taken = yearTakenOf(error);
        if (taken) router.push(stepHref(taken.existing_id, 0));
        else notify.error(t('start_failed'));
      },
    });
  }

  return { start, pending: create.isPending };
}
