/**
 * Copies centralisées des fondements religieux pour chaque rubrique du calcul de zakat.
 *
 * Volontairement prudent : on synthétise les positions majoritaires des quatre écoles
 * sunnites et on renvoie systématiquement à un érudit pour les cas particuliers.
 * Toute modification du contenu doit être relue par un référent religieux.
 */

export type ReasoningKey =
  | 'cash'
  | 'receivables'
  | 'stock'
  | 'excluded'
  | 'debts'
  | 'nisab'
  | 'rate'
  | 'hawl';

export interface RubricReasoning {
  /** Libellé court de la rubrique, en français. */
  title: string;
  /** Origine religieuse de la règle (1-3 phrases). */
  fondement: string;
  /** Comment Mizan applique concrètement cette règle (1-2 phrases). */
  application: string;
  /** Référence (hadith, école, sourate) — affichée discrètement. */
  source?: string;
}

export const ZAKAT_REASONING: Record<ReasoningKey, RubricReasoning> = {
  cash: {
    title: 'Les liquidités',
    fondement:
      "Tout argent monétaire détenu un cycle annuel lunaire complet (hawl) est zakatable s'il " +
      'atteint le Nisab. La règle est unanimement reconnue par les quatre écoles sunnites.',
    application:
      'Caisse, espèces du commerce et solde du compte bancaire professionnel. Les sommes ' +
      "physiquement bloquées (cautions, dépôts de garantie) ne sont pas comptées.",
    source: 'Coran 9:103, Bukhari/Muslim',
  },

  receivables: {
    title: 'Les créances clients',
    fondement:
      "Une créance sur un débiteur solvable est assimilée à de l'argent disponible et entre " +
      "dans la base. Une créance jugée perdue ou douteuse en est exclue jusqu'à son recouvrement " +
      'effectif (avis majoritaire des écoles Hanafi et Maliki).',
    application:
      'On distingue trois classes : certaines, probables et douteuses. Seules les certaines et ' +
      'probables entrent dans la base — les douteuses sont archivées pour mémoire uniquement.',
    source: 'Position des Compagnons rapportée par Qatâda',
  },

  stock: {
    title: 'Le stock commercial',
    fondement:
      "Les ‘urûd at-tijâra (biens destinés à la revente) sont évalués chaque année à leur " +
      'valeur marchande au moment du hawl. La zakat porte sur cette valeur, non sur les objets ' +
      'eux-mêmes.',
    application:
      "Mizan estime votre stock à partir des prix d'achat saisis dans le catalogue — c'est une " +
      'évaluation prudente. Vous pouvez la ventiler manuellement par catégorie comptable.',
    source: 'Hadith de Samura ibn Jundub (Abu Dawud)',
  },

  excluded: {
    title: 'Les outils de travail',
    fondement:
      "Les biens qui servent au commerce sans être destinés à la revente (machines, locaux, " +
      'véhicules, mobilier professionnel) ne sont pas zakatables. Ce sont des moyens de ' +
      "production, pas l'objet du commerce — consensus des quatre écoles.",
    application:
      "Cochez les catégories que vous possédez pour reconnaître explicitement qu'elles n'entrent " +
      'pas dans le calcul. Cela rend votre déclaration plus traçable.',
  },

  debts: {
    title: 'Les dettes déductibles',
    fondement:
      'Les dettes exigibles immédiatement réduisent réellement votre patrimoine disponible et ' +
      "sont à ce titre déductibles avant calcul, selon l'avis majoritaire repris par la pratique " +
      'contemporaine (AAOIFI).',
    application:
      'Un emprunt à long terme ne réduit que les mensualités du mois en cours. Pour chaque ' +
      "dette, précisez si elle est exigible immédiatement — c'est ce critère qui détermine si " +
      'elle est déduite.',
    source: 'Position Hanbali, AAOIFI Shariah Standard 35',
  },

  nisab: {
    title: 'Le seuil de Nisab',
    fondement:
      "Le Prophète ﷺ a fixé un seuil minimal en-dessous duquel la zakat n'est pas due : 85 g " +
      "d'or ou 595 g d'argent. En contexte moderne, c'est la valeur monétaire de ces quantités " +
      'qui sert de référence.',
    application:
      "Vous choisissez la méthode dans les paramètres. L'argent (seuil plus bas) est plus " +
      'inclusif et bénéficie davantage aux pauvres — recommandé par plusieurs savants ' +
      'contemporains pour la zakat commerciale.',
    source: 'Bukhari 1447, Muslim 979',
  },

  hawl: {
    title: 'Le cycle annuel (hawl)',
    fondement:
      "La zakat n'est due qu'après possession ininterrompue du patrimoine pendant un cycle " +
      'lunaire complet (~354 jours). Le compteur démarre quand le patrimoine atteint le Nisab.',
    application:
      "Choisissez une date annuelle dans les paramètres : c'est votre repère de calcul. Mizan " +
      'enverra un rappel avant chaque échéance.',
    source: 'Hadith rapporté par Ibn Umar (Abu Dawud)',
  },

  rate: {
    title: 'Le taux de 2,5 %',
    fondement:
      'Le taux de la zakat sur la richesse monétaire et commerciale est de 2,5 % (un ' +
      'quarantième). Ce chiffre est unanime entre les quatre écoles sunnites, conformément à ' +
      'la pratique du Prophète ﷺ et de ses Compagnons.',
    application:
      "Il s'applique à la base zakatable (patrimoine moins dettes exigibles), une fois le Nisab " +
      'atteint et le hawl écoulé.',
  },
};
