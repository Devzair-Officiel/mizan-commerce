// Éditeur de Mizan, tel qu'inscrit au registre officiel : source unique des
// mentions légales, de la politique de confidentialité et des CGV.
// Toute modification doit reprendre le registre mot pour mot (et rester
// identique à l'adresse déclarée à Stripe).

interface LegalPublisher {
  /** Nom et prénom de l'entrepreneur individuel, comme au registre. */
  name: string;
  legalForm: string;
  tradeName: string;
  product: string;
  siren: string;
  siret: string;
  apeCode: string;
  apeLabel: string;
  /** Adresse du siège, comme au registre. */
  address: string;
  email: string;
  /** Franchise en base : aucun numéro de TVA intracommunautaire à afficher. */
  vatNotice: string;
  publicationDirector: string;
}

export const LEGAL = {
  name: 'Aurélien BOUDON',
  legalForm: 'entrepreneur individuel (EI)',
  tradeName: 'HYPEDESIGN',
  product: 'Mizan',
  siren: '835 317 413',
  siret: '835 317 413 00036',
  apeCode: '6201Z',
  apeLabel: 'programmation informatique',
  address: '4 bis rue Saint-Léger, 78100 Saint-Germain-en-Laye',
  email: 'support@mizan-commerce.com',
  vatNotice: 'TVA non applicable, art. 293 B du CGI',
  publicationDirector: 'Aurélien Boudon',
} as const satisfies LegalPublisher;
