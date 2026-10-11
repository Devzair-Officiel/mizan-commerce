import { z } from 'zod';

/** Précision des `DecimalField` du modèle : prix (12, 2), quantités (14, 3). */
export const AMOUNT = /^\d{1,10}(?:[.,]\d{1,2})?$/;
export const QUANTITY = /^\d{1,11}(?:[.,]\d{1,3})?$/;

/** Valeur décimale saisie (« 2,5 ») au format de l'API (« 2.5 »). */
export const toDecimal = (value: string): string => value.trim().replace(',', '.');

type Translate = (key: 'quantity_invalid' | 'amount_invalid') => string;

/** Quantité strictement positive, à 3 décimales au plus. */
export const quantityField = (t: Translate) => z.string().trim()
  .refine((v) => QUANTITY.test(v) && Number(toDecimal(v)) > 0, t('quantity_invalid'));

/** Prix d'achat facultatif, à 2 décimales au plus. */
export const amountField = (t: Translate) => z.string().trim()
  .refine((v) => v === '' || AMOUNT.test(v), t('amount_invalid'));
