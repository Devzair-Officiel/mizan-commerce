'use client';

import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { SegmentedField } from '@/components/export/SegmentedField';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { ApiError } from '@/lib/api-client';
import { useCreateCustomer, type Customer } from '@/lib/hooks/useCustomers';
import { useShop } from '@/lib/hooks/useShop';
import { joinPhone, phoneCountry } from '@/lib/phone';

const FIELDS = ['name', 'siren', 'address_line', 'postal_code', 'city', 'email', 'phone'] as const;
type SheetField = (typeof FIELDS)[number];

/** Mêmes règles que le formulaire client (longueurs du modèle `Customer`) ; le serveur valide de nouveau. */
function sheetSchema(t: (key: string, values?: { max: number }) => string) {
  const text = (max: number) => z.string().trim().max(max, t('too_long', { max }));
  return z.object({
    name: text(150).min(1, t('name_required')),
    customer_type: z.enum(['individual', 'business']),
    siren: z.string().trim().refine((v) => v === '' || /^\d{9}$/.test(v.replace(/\s/g, '')), t('siren_invalid')),
    address_line: text(255),
    postal_code: text(20),
    city: text(100),
    email: z.union([z.literal(''), z.string().trim().max(254, t('too_long', { max: 254 })).email(t('email_invalid'))]),
    phone: text(30),
  });
}

/** Message d'un champ refusé par le serveur : nom déjà pris, numéro ou SIREN invalide. */
const SERVER_MESSAGE: Partial<Record<SheetField, string>> = { name: 'name_taken', phone: 'phone_invalid', siren: 'siren_invalid' };

interface InvoiceCustomerSheetProps {
  /** Recherche saisie dans le sélecteur : nom proposé. */
  name: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

/**
 * Nouveau client depuis la facture : nom, particulier ou professionnel (SIREN facultatif), adresse
 * et contact. Il rejoint aussi la liste des clients. Montée à l'ouverture (valeurs remises à zéro).
 */
export function InvoiceCustomerSheet({ name, onClose, onCreated }: InvoiceCustomerSheetProps) {
  const t = useTranslations('invoices.editor.customer');
  const tf = useTranslations('customers.form');
  const { data: shop } = useShop();
  const { mutateAsync: create, isPending } = useCreateCustomer();
  const schema = useMemo(() => sheetSchema(tf), [tf]);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name, customer_type: 'individual' as const, siren: '', address_line: '', postal_code: '', city: '', email: '', phone: '' } });
  const { register, control, formState: { errors } } = form;
  const type = useWatch({ control, name: 'customer_type' });

  const submit = form.handleSubmit(async (data) => {
    try {
      const phone = joinPhone(phoneCountry(shop?.country), data.phone);
      onCreated(await create({ ...data, phone, siren: data.customer_type === 'business' ? data.siren : '' }));
      onClose();
    } catch (err) {
      const fieldErrors = err instanceof ApiError && err.status === 400 ? (err.data as { errors?: Record<string, unknown> } | null)?.errors : undefined;
      const fields = FIELDS.filter((f) => fieldErrors && f in fieldErrors);
      fields.forEach((f) => form.setError(f, { type: 'server', message: tf(SERVER_MESSAGE[f] ?? 'field_invalid') }, { shouldFocus: f === fields[0] }));
      if (!fields.length) form.setError('root', { message: t('create_error') });
    }
  });

  const field = (f: SheetField, label: string, props: { inputMode?: 'numeric' | 'email' | 'tel'; type?: string } = {}) => <div className="flex flex-col gap-0.5">
    <FloatingInput id={`invoice-customer-${f}`} label={label} dir={props.type ? undefined : 'auto'} autoComplete="off" aria-invalid={!!errors[f]} {...props} {...register(f)} />
    {errors[f] && <p className="px-1 text-[11px] text-destructive">{errors[f].message}</p>}
  </div>;
  const footer = <div className="flex flex-col gap-2">
    {errors.root && <p role="alert" className="text-xs text-destructive">{errors.root.message}</p>}
    <p className="text-xs text-muted-foreground">{t('also_saved')}</p>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" className="h-11 rounded-full" onClick={onClose}>{t('cancel')}</Button>
      <Button type="submit" form="invoice-customer-form" className="h-11 rounded-full" disabled={isPending}>{t(isPending ? 'creating' : 'create')}</Button>
    </div>
  </div>;
  return <BottomSheet open onClose={onClose} title={t('sheet_title')} footer={footer}>
    <form id="invoice-customer-form" noValidate onSubmit={submit} className="flex flex-col gap-3">
      {field('name', tf('name'))}
      <SegmentedField label={tf('customer_type')} register={register('customer_type')} columns="grid-cols-2"
        options={(['individual', 'business'] as const).map((value) => ({ value, label: tf('customer_type_option', { value }) }))} />
      {type === 'business' && field('siren', t('siren'), { inputMode: 'numeric' })}
      {field('address_line', tf('address'))}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">{field('postal_code', tf('postal_code'))}{field('city', tf('city'))}</div>
      {field('email', tf('email'), { inputMode: 'email', type: 'email' })}
      {field('phone', tf('phone'), { inputMode: 'tel', type: 'tel' })}
    </form>
  </BottomSheet>;
}
