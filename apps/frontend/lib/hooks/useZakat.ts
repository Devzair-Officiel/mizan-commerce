import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

// ── Choix d'avis ─────────────────────────────────────────────────────────────

export type HawlCalendar = 'hijri' | 'gregorian';
export type NisabMethod = 'silver' | 'gold';
export type StockValuation = 'sale' | 'purchase';
export type ReceivablesMode = 'yearly' | 'on_collection';
export type DebtsMode = 'all' | 'within_12_months' | 'none';

/** Options de chaque choix, dans l'ordre fixe du référentiel (§ 1) : aucune n'est recommandée. */
export const CHOICE_OPTIONS = {
  calendar: ['hijri', 'gregorian'],
  nisab_method: ['silver', 'gold'],
  stock_valuation: ['sale', 'purchase'],
  receivables_mode: ['yearly', 'on_collection'],
  debts_mode: ['all', 'within_12_months', 'none'],
} as const satisfies Record<string, readonly string[]>;

export type ChoiceName = keyof typeof CHOICE_OPTIONS;
export type ChoiceOption<C extends ChoiceName> = (typeof CHOICE_OPTIONS)[C][number];

/** Choix copiés dans la fiche ; `null` (ou `''`) tant que la personne n'a pas choisi. */
export interface ZakatChoices {
  calendar: HawlCalendar | null;
  nisab_method: NisabMethod | null;
  nisab_unit_price: string | null;
  nisab_price_updated_at: string | null;
  stock_valuation: StockValuation | null;
  receivables_mode: ReceivablesMode | null;
  debts_mode: DebtsMode | null;
  ownership_share: string | null;
}

// ── Saisies ──────────────────────────────────────────────────────────────────

export type DebtCategory = 'supplier' | 'tax_vat' | 'salary' | 'loan' | 'rent' | 'other';
export type OtherAssetCategory =
  | 'personal_cash' | 'business' | 'real_estate' | 'gold_silver' | 'jewelry' | 'for_resale' | 'other';

/** Ligne de la boutique (part appliquée) ou de la personne (comptée en entier). */
export type LineScope = 'shop' | 'personal';

/** Listes dont chaque ligne a une portée (boutique ou personnelle). */
export type ScopeList = 'receivables' | 'debts';

export interface ReceivableItem {
  /** Identifiant stable de la ligne : le suivi à l'encaissement s'y rattache. */
  id: string;
  order_id: string | null;
  label: string;
  amount: string;
  doubtful: boolean;
  /** Toujours « shop » pour une commande ; `null` tant que la personne n'a pas choisi. */
  scope: LineScope | null;
}

export interface OtherAsset {
  category: OtherAssetCategory;
  label: string;
  amount: string;
  counted: boolean;
}

export interface DebtLine {
  id: string;
  /** `null` tant que la personne n'a pas choisi : « boutique » à 100 %, à préciser en dessous. */
  scope: LineScope | null;
  category: DebtCategory;
  label: string;
  amount: string;
  amount_within_12_months: string;
}

export interface HijriDate {
  year: number;
  month: number;
  day: number;
}

// ── Calcul du serveur ────────────────────────────────────────────────────────

export type TotalsStatus = 'choice_missing' | 'nisab_unknown' | 'below_nisab' | 'above_nisab';

/** Montants calculés par le serveur (seul à calculer) : chaînes décimales, `null` si incalculables. */
export interface ZakatTotals {
  status: TotalsStatus;
  missing_choices: ChoiceName[];
  /** Lignes dont la portée reste à choisir (part inférieure à 100 %), par liste : `id` des lignes. */
  missing_scopes: Partial<Record<ScopeList, string[]>>;
  ownership_share: string;
  cash: string;
  stock: string | null;
  stock_at_sale_price: string;
  stock_at_purchase_price: string;
  /** `null` (comme les autres sommes de lignes) tant qu'une portée reste à choisir. */
  receivables_sure: string | null;
  /** Ce qui, dans le montant voisin, vient de lignes personnelles (comptées en entier). */
  receivables_sure_personal: string;
  receivables_doubtful: string | null;
  receivables_in_base: string | null;
  receivables_on_collection: string | null;
  other_assets: string;
  debts_total: string | null;
  debts_total_personal: string;
  debts_within_12_months: string | null;
  debts_within_12_months_personal: string;
  debts_deducted: string | null;
  /** Montant déduit pour chaque dette (`id` → montant) ; leur somme vaut `debts_deducted`. */
  debt_deducted: Record<string, string | null>;
  base: string | null;
  nisab_threshold: string | null;
  nisab_compared_amount: string | null;
  /** Plus petit / plus grand de (net, seuil), entre 0 et 1 : largeur de la jauge. */
  nisab_ratio: string | null;
  rate: string | null;
  zakat_now: string | null;
  zakat_on_collection: string | null;
  zakat_total: string | null;
  /** Zakat totale avec chaque option d'un choix, les autres choix restant ceux de la fiche. */
  option_effects: { [C in ChoiceName]: Record<ChoiceOption<C>, string | null> };
}

export type OrderState = 'unchanged' | 'settled' | 'cancelled' | 'changed' | 'removed';

export interface OrderSummary {
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  created_at: string | null;
  remaining: string | null;
}

export interface ZakatReview {
  is_latest: boolean;
  /** Jour J pas encore passé : la fiche suit la boutique (stock, commandes). */
  is_live: boolean;
  hawl_date_differs: boolean;
  receivable_orders: {
    linked: (OrderSummary & { state: OrderState })[];
    new: OrderSummary[];
  };
}

export interface ZakatCalculation {
  id: string;
  current_step: number;
  reference_date: string;
  reference_hijri: HijriDate | null;
  hawl_calendar: HawlCalendar;
  hawl_year: number;
  version: number;
  cash_amount: string;
  stock_extra: string;
  stock_sale_value: string;
  stock_purchase_value: string;
  receivable_items: ReceivableItem[];
  other_assets: OtherAsset[];
  debt_items: DebtLine[];
  choices: ZakatChoices;
  totals: ZakatTotals;
  review: ZakatReview;
  currency: string;
  /** « Marquer comme versée » : date et montant notés par la personne. */
  paid_on: string | null;
  paid_amount: string | null;
  updated_at: string;
}

export interface ZakatListRow {
  id: string;
  reference_date: string;
  reference_hijri: HijriDate | null;
  hawl_calendar: HawlCalendar;
  hawl_year: number;
  current_step: number;
  currency: string;
  paid_on: string | null;
  paid_amount: string | null;
  updated_at: string;
  totals: ZakatTotals;
}

/** Champs modifiables d'une fiche ; `choices` ne porte que les choix modifiés. */
export interface ZakatCalculationChanges {
  current_step?: number;
  reference_date?: string;
  cash_amount?: string;
  stock_extra?: string;
  refresh_stock?: boolean;
  receivable_items?: ReceivableItem[];
  other_assets?: OtherAsset[];
  debt_items?: DebtLine[];
  choices?: Partial<Omit<ZakatChoices, 'nisab_price_updated_at'>>;
}

// ── Profil et sources ────────────────────────────────────────────────────────

export interface NextHawl {
  date: string;
  hijri: HijriDate;
  days_remaining: number;
  cycle_length: number;
  hawl_calendar: HawlCalendar;
  hawl_year: number;
  calculation_id: string | null;
}

export interface ZakatProfile extends Omit<ZakatChoices, 'ownership_share'> {
  hawl_date: string | null;
  ownership_share: string;
  nisab_threshold: string | null;
  next_hawl: NextHawl | null;
  reminder_email_enabled: boolean;
  updated_at: string;
}

export type ZakatProfileChanges = Partial<Omit<ZakatProfile, 'next_hawl' | 'nisab_threshold' | 'nisab_price_updated_at' | 'updated_at'>>;

export interface StockLine {
  variant_id: string;
  product_id: string;
  product_name: string;
  packaging_name: string;
  quantity: string;
  sale_price: string;
  purchase_price: string | null;
  sale_value: string;
  purchase_value: string | null;
}

export interface ZakatSources {
  currency: string;
  stock_sale_value: string;
  stock_purchase_value: string;
  active_formats_count: number;
  formats_without_purchase_price: Pick<StockLine, 'variant_id' | 'product_id' | 'product_name' | 'packaging_name'>[];
  top_stock_lines: Record<StockValuation, StockLine[]>;
  unpaid_orders: OrderSummary[];
  unpaid_total: string;
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── Erreurs 409 ──────────────────────────────────────────────────────────────

/** L'année de hawl est déjà prise par une autre fiche de la personne. */
export interface YearTaken {
  existing_id: string;
  hawl_calendar: HawlCalendar;
  hawl_year: number;
}

export function yearTakenOf(error: unknown): YearTaken | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const data = error.data as Partial<YearTaken> | null;
  return data && typeof data.existing_id === 'string' ? (data as YearTaken) : null;
}

/** La fiche a changé ailleurs (autre onglet, autre appareil) depuis la dernière lecture. */
export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && yearTakenOf(error) === null;
}

/** Justificatif PDF d'une fiche, téléchargé via le proxy (réservé à son auteur). */
export function zakatPdfHref(id: string): string {
  return `/api/proxy/zakat/calculations/${id}/pdf/`;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useZakatCalculations() {
  return useQuery({
    queryKey: qk.zakat.lists,
    queryFn: () => apiFetch<Paginated<ZakatListRow>>('/zakat/calculations/'),
  });
}

export function useZakatCalculation(id: string) {
  return useQuery({
    queryKey: qk.zakat.detail(id),
    queryFn: () => apiFetch<ZakatCalculation>(`/zakat/calculations/${id}/`),
    enabled: !!id,
  });
}

export function useZakatProfile(enabled = true) {
  return useQuery({
    queryKey: qk.zakat.profile,
    queryFn: () => apiFetch<ZakatProfile>('/zakat/profile/'),
    enabled,
  });
}

export function useZakatSources() {
  return useQuery({
    queryKey: qk.zakat.sources,
    queryFn: () => apiFetch<ZakatSources>('/zakat/sources/'),
  });
}

/** Création au clic : jour J et choix repris du profil par le serveur. */
export function useCreateZakatCalculation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: ZakatCalculationChanges = {}) =>
      apiFetch<ZakatCalculation>('/zakat/calculations/', { method: 'POST', body: JSON.stringify(changes) }),
    onSuccess: (calc) => {
      qc.setQueryData(qk.zakat.detail(calc.id), calc);
      qc.invalidateQueries({ queryKey: qk.zakat.lists });
      qc.invalidateQueries({ queryKey: qk.zakat.profile });
    },
  });
}

/**
 * Écriture conditionnelle (`version` obligatoire). La fiche renvoyée remplace le cache ; la liste et
 * le profil (qui suit les choix de la fiche la plus récente) sont relus.
 */
export function useUpdateZakatCalculation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ changes, version }: { changes: ZakatCalculationChanges; version: number }) =>
      apiFetch<ZakatCalculation>(`/zakat/calculations/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ ...changes, version }),
      }),
    onSuccess: (calc) => {
      qc.setQueryData(qk.zakat.detail(id), calc);
      qc.invalidateQueries({ queryKey: qk.zakat.lists });
      qc.invalidateQueries({ queryKey: qk.zakat.profile });
      // Le suivi à l'encaissement se calcule sur les lignes des fiches passées.
      qc.invalidateQueries({ queryKey: qk.zakat.followups });
    },
  });
}

export interface ZakatPayment {
  paid_on: string;
  paid_amount: string;
}

/**
 * « Marquer comme versée » (PUT, date et montant) et « Versée par erreur ? Revenir » (DELETE),
 * écriture conditionnelle par `version`. La fiche renvoyée remplace le cache ; l'historique est relu.
 */
export function useZakatPayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payment, version }: { payment: ZakatPayment | null; version: number }) =>
      apiFetch<ZakatCalculation>(`/zakat/calculations/${id}/payment/`, {
        method: payment ? 'PUT' : 'DELETE',
        body: JSON.stringify({ ...payment, version }),
      }),
    onSuccess: (calc) => {
      qc.setQueryData(qk.zakat.detail(id), calc);
      qc.invalidateQueries({ queryKey: qk.zakat.lists });
    },
    onError: (error) => {
      if (isVersionConflict(error)) qc.invalidateQueries({ queryKey: qk.zakat.detail(id) });
    },
  });
}

export function useDeleteZakatCalculation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/zakat/calculations/${id}/`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: qk.zakat.detail(id) });
      qc.invalidateQueries({ queryKey: qk.zakat.lists });
      qc.invalidateQueries({ queryKey: qk.zakat.profile });
      qc.invalidateQueries({ queryKey: qk.zakat.followups });
    },
  });
}

export function useUpdateZakatProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: ZakatProfileChanges) =>
      apiFetch<ZakatProfile>('/zakat/profile/', { method: 'PATCH', body: JSON.stringify(changes) }),
    onSuccess: (profile) => {
      qc.setQueryData(qk.zakat.profile, profile);
      // `review.hawl_date_differs` des fiches dépend du jour J du profil.
      qc.invalidateQueries({ queryKey: qk.zakat.details });
    },
  });
}
