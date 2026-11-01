'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { SegmentedField } from '@/components/export/SegmentedField';
import { FormField } from '@/components/form/FormField';
import { FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import { useCreditNotePreview } from '@/lib/hooks/useCreditNotes';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { CreditNoteLines } from './CreditNoteLines';
import { CreditNotePreviewCard } from './CreditNotePreviewCard';
import { CreditNoteWarnings } from './CreditNoteWarnings';
import { REASON_MAX, useCreditNoteForm } from './useCreditNoteForm';
import { useCreditNoteSubmit } from './useCreditNoteSubmit';

/** Case « Créditer la livraison », avec le reste de livraison créditable. */
function ShippingOption({ invoice, register }: { invoice: Invoice; register: UseFormRegisterReturn }) {
  const t = useTranslations('invoices.credit');
  const money = useFormatMoney();
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
    <input type="checkbox" {...register} className="size-5 shrink-0 accent-primary" />
    <span className="flex-1">{t('shipping')}</span>
    <span dir="ltr" className="tabular-nums text-muted-foreground">{money(invoice.shipping_creditable ?? '0', invoice.currency)}</span>
  </label>;
}

/**
 * Création d'un avoir sur une facture émise ou payée : tout le reste ou une partie, motif obligatoire.
 * Les montants viennent de l'aperçu du serveur, jamais d'un calcul local. La facture est figée à
 * l'ouverture : son rechargement après la création ne fait pas bouger les bornes pendant la redirection.
 */
export function CreditNoteSheet({ invoice: current, onClose }: { invoice: Invoice; onClose: () => void }) {
  const t = useTranslations('invoices.credit');
  const formId = useId();
  const [invoice] = useState(current);
  const credit = useCreditNoteForm(invoice);
  const preview = useCreditNotePreview(invoice.id, credit.input);
  const issues = preview.data?.issues ?? [];
  const { submit, pending } = useCreditNoteSubmit(invoice, credit, issues, onClose);
  const { register, formState: { errors } } = credit.form;
  const ready = !!credit.input && !preview.settling && !!preview.data?.totals && !preview.data.refusals.length;
  const close = () => { if (!pending) onClose(); };

  const footer = <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Button type="button" variant="outline" className="h-11 rounded-full" disabled={pending} onClick={close}>{t('cancel')}</Button>
    <Button type="submit" form={formId} className="h-11 rounded-full" disabled={pending || !ready}>{t(pending ? 'submitting' : 'submit')}</Button>
  </div>;
  return <BottomSheet open onClose={close} title={t('title')} description={t('description', { number: invoice.number })} footer={footer}>
    <form id={formId} onSubmit={submit} noValidate>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
        <SegmentedField tall label={t('mode')} columns="grid-cols-2" register={register('mode')}
          options={[{ value: 'total', label: t('mode_total') }, { value: 'partial', label: t('mode_partial') }]}>
          {!credit.partial && <p className="text-xs text-muted-foreground">{t('mode_total_help')}</p>}
        </SegmentedField>
        {credit.partial && <CreditNoteLines invoice={invoice} control={credit.form.control} />}
        {credit.partial && Number(invoice.shipping_creditable ?? 0) > 0 && <ShippingOption invoice={invoice} register={register('include_shipping')} />}
        <FormField label={t('reason')} required help={t('reason_help', { max: REASON_MAX })} error={errors.reason?.message}>
          {(c) => <textarea {...c} {...register('reason')} dir="auto" rows={3} className={FIELD_TEXTAREA} />}
        </FormField>
        <p className="flex items-start gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
          <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />{t('unchanged')}
        </p>
        {credit.input && <CreditNotePreviewCard invoice={invoice} preview={preview} />}
        {issues.length > 0 && <CreditNoteWarnings issues={issues} register={register('accepted')} error={errors.accepted?.message} />}
      </fieldset>
    </form>
  </BottomSheet>;
}
