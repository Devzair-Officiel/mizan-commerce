import { z } from 'zod';

export const CURRENCIES = ['EUR', 'MAD', 'TND', 'DZD', 'XOF', 'USD', 'GBP'] as const;

export const COUNTRIES = [
  { code: 'FR', label: 'France' },
  { code: 'MA', label: 'Maroc' },
  { code: 'TN', label: 'Tunisie' },
  { code: 'DZ', label: 'Algérie' },
  { code: 'SN', label: 'Sénégal' },
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'BE', label: 'Belgique' },
  { code: 'GB', label: 'Royaume-Uni' },
];

export const settingsSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  currency: z.string().min(1),
  country: z.string().optional(),
  zakat_annual_date: z.string().optional(),
  nisab_method: z.enum(['gold', 'silver']),
  nisab_unit_price: z.string().optional(),
  legal_address: z.string().optional(),
  tax_id: z.string().optional(),
  legal_mentions: z.string().optional(),
  default_tax_rate: z.string().optional(),
  default_payment_terms_days: z.string().optional(),
  catalog_kind: z.enum(['products', 'services', 'both']),
  dashboard_mode: z.enum(['minimal', 'complete']),
});

export type SettingsFormValues = z.infer<typeof settingsSchema>;
