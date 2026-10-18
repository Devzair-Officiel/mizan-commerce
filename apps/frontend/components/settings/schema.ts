import { z } from 'zod';

export const CURRENCIES = ['EUR', 'MAD', 'TND', 'DZD', 'XOF', 'USD', 'GBP'] as const;

/** Codes ISO 3166-1 ; le nom s'affiche dans la langue de l'interface (useCountryNames). */
export const COUNTRIES = ['FR', 'MA', 'TN', 'DZ', 'SN', 'CI', 'BE', 'GB'] as const;

export const settingsSchema = z.object({
  name: z.string().min(1), // message : settings.identity.name_required
  currency: z.string().min(1),
  country: z.string().optional(),
  legal_address: z.string().optional(),
  tax_id: z.string().optional(),
  legal_mentions: z.string().optional(),
  default_tax_rate: z.string().optional(),
  default_payment_terms_days: z.string().optional(),
  catalog_kind: z.enum(['products', 'services', 'both']),
  fulfillment_mode: z.enum(['on_site', 'delivery', 'both']).nullable().optional(),
});

export type SettingsFormValues = z.infer<typeof settingsSchema>;
