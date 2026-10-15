'use client';

import type { UseFormReturn } from 'react-hook-form';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { formatIban, formatSiret, formatVatNumber } from '@/lib/invoiceFormatting';
import type { InvoiceSettingsValues } from './schema';

type IdentifierField = 'siret' | 'vat_number' | 'invoice_iban';
const FORMAT = { siret: formatSiret, vat_number: formatVatNumber, invoice_iban: formatIban };

/** La saisie accepte les espaces ; le serveur valide et enregistre la valeur compacte. */
export function InvoiceIdentifierField({ form, name, label, help, error, required }: {
  form: UseFormReturn<InvoiceSettingsValues>; name: IdentifierField; label: string;
  help?: string; error?: string; required?: boolean;
}) {
  return (
    <FormField label={label} help={help} error={error} required={required}>
      {(c) => <input {...c} {...form.register(name, {
        onBlur: () => form.setValue(name, FORMAT[name](form.getValues(name)), { shouldDirty: true, shouldValidate: true }),
      })} dir="ltr" inputMode={name === 'siret' ? 'numeric' : 'text'} className={FIELD_CONTROL} />}
    </FormField>
  );
}
