import { z } from 'zod';
import { AMOUNT_PATTERN, isZeroDecimal, normalizeDecimal } from '@/lib/decimal';
import type { OtherAsset, OtherAssetCategory } from '@/lib/hooks/useZakat';

/** Catégories proposées (raccourcis, menu) : les bijoux portés se précisent sous « Or et argent ». */
export const ASSET_KINDS = ['personal_cash', 'business', 'real_estate', 'gold_silver', 'for_resale', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export type Metal = 'bullion' | 'jewelry';

interface AssetMessages {
  label: string;
  amount: string;
  metal: string;
  jewelry: string;
}

/**
 * Q8 : « Compté » activé par défaut, sauf pour l'or et l'argent. Lingots et pièces : compté par défaut ;
 * bijoux portés : aucun défaut, « Compter » ou « Ne pas compter » à choisir.
 */
export function assetSchema(messages: AssetMessages) {
  return z.object({
    kind: z.enum(ASSET_KINDS),
    metal: z.enum(['bullion', 'jewelry']).nullable(),
    label: z.string().trim().min(1, messages.label).max(200),
    amount: z.string().trim().refine((v) => AMOUNT_PATTERN.test(v) && !isZeroDecimal(normalizeDecimal(v)), messages.amount),
    counted: z.boolean().nullable(),
  }).superRefine((v, ctx) => {
    if (v.kind !== 'gold_silver') return;
    if (v.metal === null) ctx.addIssue({ code: 'custom', path: ['metal'], message: messages.metal });
    else if (v.metal === 'jewelry' && v.counted === null) ctx.addIssue({ code: 'custom', path: ['counted'], message: messages.jewelry });
  });
}

export type AssetFormValues = z.infer<ReturnType<typeof assetSchema>>;

export function assetFormValues(asset: OtherAsset | undefined, kind: AssetKind, label: string, amountInput: (v: string) => string): AssetFormValues {
  if (!asset) {
    return { kind, metal: null, label, amount: '', counted: kind === 'gold_silver' ? null : true };
  }
  const metal: Metal | null = asset.category === 'jewelry' ? 'jewelry' : asset.category === 'gold_silver' ? 'bullion' : null;
  return {
    kind: asset.category === 'jewelry' ? 'gold_silver' : asset.category,
    metal,
    label: asset.label,
    amount: amountInput(asset.amount),
    counted: asset.counted,
  };
}

export function assetOf(values: AssetFormValues): OtherAsset {
  const category: OtherAssetCategory = values.kind === 'gold_silver' && values.metal === 'jewelry' ? 'jewelry' : values.kind;
  return { category, label: values.label, amount: normalizeDecimal(values.amount), counted: values.counted ?? true };
}
