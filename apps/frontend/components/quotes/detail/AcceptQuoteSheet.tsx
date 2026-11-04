'use client';

import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { FormField } from '@/components/form/FormField';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Quote } from '@/lib/hooks/useQuotes';

/** Longueur maximale de `accepted_name`, revérifiée par le serveur. */
const NAME_MAX = 200;

interface AcceptQuoteSheetProps {
  quote: Quote;
  /** Accord en cours d'enregistrement : la feuille ne se ferme pas, les boutons sont inactifs. */
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

/** « Marquer accepté » : accord reçu hors de l'app, avec le nom (facultatif) de la personne qui l'a donné. */
export function AcceptQuoteSheet({ quote, pending, onClose, onSubmit }: AcceptQuoteSheetProps) {
  const t = useTranslations('quotes.accept');
  const money = useFormatMoney();
  const formId = useId();
  const schema = z.object({ name: z.string().trim().max(NAME_MAX, t('name_too_long', { max: NAME_MAX })) });
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema), defaultValues: { name: '' },
  });
  const close = () => { if (!pending) onClose(); };
  const footer = <div className="flex items-center justify-end gap-2">
    <Button type="button" variant="ghost" onClick={close} disabled={pending} className="h-11 rounded-full px-4">{t('cancel')}</Button>
    <Button type="submit" form={formId} disabled={pending} className="h-11 flex-1 rounded-full px-5 font-semibold lg:flex-none">{t('submit')}</Button>
  </div>;

  return <BottomSheet open onClose={close} title={t('title')} footer={footer}
    description={t('body', { number: quote.number, amount: money(quote.total_ttc, quote.currency) })}>
    <form id={formId} noValidate onSubmit={handleSubmit(values => onSubmit(values.name))} className="flex flex-col gap-4">
      <FormField label={t('name')} help={t('name_help')} error={errors.name?.message}>
        {(c) => <input {...c} {...register('name')} autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
    </form>
  </BottomSheet>;
}
