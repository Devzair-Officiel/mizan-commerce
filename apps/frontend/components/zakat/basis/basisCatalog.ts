import type { ChoiceName, ChoiceOption } from '@/lib/hooks/useZakat';
import type { ChipKey } from '../choice/choiceCatalog';

/**
 * Fiches « Fondement » (référentiel, § 7) : une par rubrique, plus les huit catégories (Coran 9:60).
 * Les textes sont dans `zakat.basis.*` ; ici, seulement la structure : sources, badges, avis.
 */
export type BasisTopic = 'cash' | 'stock' | 'usage' | 'receivables' | 'other' | 'debts' | 'nisab' | 'rate' | 'recipients';

export const BASIS_TOPICS: readonly BasisTopic[] = ['cash', 'stock', 'usage', 'receivables', 'other', 'debts', 'nisab', 'rate', 'recipients'];

/** Niveaux de fiabilité (référentiel, § 2). Un hadith discuté n'apparaît jamais sans le sien. */
export type BasisBadge = 'authentic' | 'discussed' | 'companion' | 'school' | 'contemporary';

/** `judged` : la source porte un jugement de chaîne nommé (`zakat.basis.source.<key>.judgment`). */
export interface BasisSource {
  key: string;
  badge: BasisBadge;
  judged?: boolean;
}

/** Avis d'un choix de la fiche : « Votre choix » marque l'option retenue. `note` : qui la retient, en une phrase. */
type ChoiceOpinions = {
  [C in ChoiceName]: { choice: C; items: readonly { option: ChoiceOption<C>; chips: readonly ChipKey[]; note?: boolean }[] };
}[ChoiceName];

/** Avis sans choix dans Mizan (créances douteuses, bijoux, immobilier) : `zakat.basis.opinion.<group>.<key>`. */
interface FreeOpinions {
  group: string;
  items: readonly { key: string; chips: readonly ChipKey[]; note?: boolean }[];
}

export type BasisOpinionGroup = ChoiceOpinions | FreeOpinions;

export interface BasisEntry {
  /** Deuxième phrase sous la règle (`zakat.basis.topic.<topic>.detail`). */
  detail?: boolean;
  sources: readonly BasisSource[];
  /** Vide : point d'accord, aucun choix. */
  opinions: readonly BasisOpinionGroup[];
}

const S = {
  quran_2_267: { key: 'quran_2_267', badge: 'authentic' },
  quran_9_60: { key: 'quran_9_60', badge: 'authentic' },
  bukhari_1454: { key: 'bukhari_1454', badge: 'authentic' },
  bukhari_1459: { key: 'bukhari_1459', badge: 'authentic' },
  bukhari_1463: { key: 'bukhari_1463', badge: 'authentic' },
  abu_dawud_1562: { key: 'abu_dawud_1562', badge: 'discussed', judged: true },
  abu_dawud_1573: { key: 'abu_dawud_1573', badge: 'authentic', judged: true },
  abu_dawud_1574: { key: 'abu_dawud_1574', badge: 'authentic', judged: true },
  ibn_umar: { key: 'ibn_umar', badge: 'companion', judged: true },
  umar_himas: { key: 'umar_himas', badge: 'companion', judged: true },
  uthman: { key: 'uthman', badge: 'companion', judged: true },
  stock_schools: { key: 'stock_schools', badge: 'school' },
  receivables_schools: { key: 'receivables_schools', badge: 'school' },
  jewelry_schools: { key: 'jewelry_schools', badge: 'school' },
  real_estate: { key: 'real_estate', badge: 'school' },
  aaoifi_stock: { key: 'aaoifi_stock', badge: 'contemporary' },
  aaoifi_debts: { key: 'aaoifi_debts', badge: 'contemporary' },
  aaoifi_rate: { key: 'aaoifi_rate', badge: 'contemporary' },
} as const satisfies Record<string, BasisSource>;

export const BASIS: Record<BasisTopic, BasisEntry> = {
  cash: { sources: [S.bukhari_1454, S.bukhari_1459, S.abu_dawud_1573], opinions: [] },
  stock: {
    sources: [S.quran_2_267, S.abu_dawud_1562, S.ibn_umar, S.umar_himas, S.stock_schools, S.aaoifi_stock],
    opinions: [{ choice: 'stock_valuation', items: [
      { option: 'sale', chips: ['four_schools', 'contemporary'], note: true },
      { option: 'purchase', chips: ['aaoifi'], note: true },
    ] }],
  },
  usage: { sources: [S.bukhari_1463], opinions: [] },
  receivables: {
    detail: true,
    sources: [S.receivables_schools],
    opinions: [
      { choice: 'receivables_mode', items: [
        { option: 'yearly', chips: ['shafii', 'maliki'], note: true },
        { option: 'on_collection', chips: ['hanafi', 'hanbali'] },
      ] },
      { group: 'doubtful', items: [
        { key: 'all_years', chips: ['shafii', 'ali'] },
        { key: 'one_year', chips: ['maliki', 'al_hasan', 'umar_abd_al_aziz'] },
        { key: 'new_year', chips: ['permanent_committee', 'ibn_baz'] },
      ] },
    ],
  },
  other: {
    detail: true,
    sources: [S.quran_2_267, S.bukhari_1463, S.bukhari_1459, S.jewelry_schools, S.real_estate],
    opinions: [
      { group: 'jewelry', items: [
        { key: 'counted', chips: ['hanafi'] },
        { key: 'not_counted', chips: ['maliki', 'shafii', 'hanbali'] },
      ] },
      { group: 'real_estate', items: [
        { key: 'home', chips: [], note: true },
        { key: 'rented', chips: [], note: true },
        { key: 'resale', chips: [], note: true },
      ] },
    ],
  },
  debts: {
    detail: true,
    sources: [S.uthman, S.aaoifi_debts],
    opinions: [{ choice: 'debts_mode', items: [
      { option: 'all', chips: ['hanafi', 'maliki', 'hanbali', 'shafii_old'], note: true },
      { option: 'within_12_months', chips: ['aaoifi', 'contemporary'] },
      { option: 'none', chips: ['shafii_new', 'ibn_baz'] },
    ] }],
  },
  nisab: {
    detail: true,
    sources: [S.bukhari_1459, S.abu_dawud_1573],
    opinions: [{ choice: 'nisab_method', items: [
      { option: 'silver', chips: [], note: true },
      { option: 'gold', chips: [], note: true },
    ] }],
  },
  rate: {
    detail: true,
    sources: [S.bukhari_1454, S.abu_dawud_1574, S.abu_dawud_1573, S.aaoifi_rate],
    opinions: [{ choice: 'calendar', items: [
      { option: 'hijri', chips: ['rate_hijri'] },
      { option: 'gregorian', chips: ['rate_solar', 'aaoifi'] },
    ] }],
  },
  recipients: { sources: [S.quran_9_60], opinions: [] },
};

/** Les huit catégories (Coran 9:60), dans l'ordre du verset : `zakat.basis.category.<n>`. */
export const RECIPIENT_CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Fiche ouverte par « Sur quoi reposent ces avis ? » sous chaque choix. */
export const CHOICE_TOPIC: Record<ChoiceName, BasisTopic> = {
  calendar: 'rate',
  nisab_method: 'nisab',
  stock_valuation: 'stock',
  receivables_mode: 'receivables',
  debts_mode: 'debts',
};

/** Choix de la personne (fiche en cours ou réglages) : marque « Votre choix ». */
export type BasisChoices = Partial<Record<ChoiceName, string | null>>;

/** Contenu du tiroir : la liste des neuf fiches, ou l'une d'elles. */
export type BasisView = BasisTopic | 'index';
