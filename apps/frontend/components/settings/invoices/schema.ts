import { z } from 'zod';

export const invoiceSettingsSchema = z.object({
  invoice_color_mode: z.enum(['automatic', 'custom', 'neutral']),
  invoice_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  legal_address: z.string().max(2000),
  tax_id: z.string().max(64),
  siret: z.string().refine((s) => s === '' || /^\d{14}$/.test(s.replace(/\s/g, ''))),
  invoice_vat_regime: z.enum(['exempt', 'applicable']),
  vat_number: z.string().max(32),
  legal_mentions: z.string().max(2000),
  default_tax_rate: z.string().refine((s) => /^\d+(\.\d{1,2})?$/.test(s) && Number(s) <= 100),
  default_payment_terms_days: z.number().int().min(0).max(365),
  invoice_payment_methods: z.array(z.enum(['cash', 'card', 'transfer', 'cheque'])),
  invoice_iban: z.string().max(80),
  invoice_bic: z.string().max(32),
  invoice_show_account_summary: z.boolean(),
  invoice_show_order: z.boolean(),
}).superRefine((values, ctx) => {
  if (values.invoice_vat_regime === 'applicable' && !values.vat_number.trim()) {
    ctx.addIssue({ code: 'custom', path: ['vat_number'], message: 'invalid' });
  }
});

export type InvoiceSettingsValues = z.infer<typeof invoiceSettingsSchema>;

/** Garder seulement les champs éditables : les propriétés d'aperçu ne sont pas des saisies. */
export function invoiceFormValues(values: InvoiceSettingsValues): InvoiceSettingsValues {
  return {
    invoice_color_mode: values.invoice_color_mode,
    invoice_color: values.invoice_color,
    legal_address: values.legal_address,
    tax_id: values.tax_id,
    siret: values.siret,
    invoice_vat_regime: values.invoice_vat_regime,
    vat_number: values.vat_number,
    legal_mentions: values.legal_mentions,
    default_tax_rate: values.default_tax_rate,
    default_payment_terms_days: values.default_payment_terms_days,
    invoice_payment_methods: values.invoice_payment_methods,
    invoice_iban: values.invoice_iban,
    invoice_bic: values.invoice_bic,
    invoice_show_account_summary: values.invoice_show_account_summary,
    invoice_show_order: values.invoice_show_order,
  };
}
