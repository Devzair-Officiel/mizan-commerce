/** Champ du gabarit de formulaire : h-11, rounded-xl, fond de carte, focus aux couleurs du thème, bordure rouge quand `aria-invalid`. */
export const FIELD_CONTROL =
  'h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3.5 text-sm text-foreground ' +
  'outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground ' +
  'focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 ' +
  'aria-invalid:border-red-600 aria-invalid:focus-visible:ring-red-600/20 dark:aria-invalid:border-red-400';

/** Valeur en lecture seule (unité définitive, stock actuel) : même champ, sur fond atténué. */
export const FIELD_READONLY = `${FIELD_CONTROL.replace('bg-card', 'bg-muted')} flex items-center`;

/** Zone de texte : mêmes bordures que le champ, hauteur libre. */
export const FIELD_TEXTAREA = `${FIELD_CONTROL.replace('h-11', 'min-h-24')} resize-y py-2.5`;

/** Grille des champs d'une section : colonnes de 12.5rem minimum, une seule sur mobile. */
export const FIELD_GRID = 'grid grid-cols-[repeat(auto-fit,minmax(min(12.5rem,100%),1fr))] gap-4';

/** Deux champs côte à côte dans une carte (prix de vente et d'achat…), un seul par ligne s'il manque de place. */
export const FIELD_ROW = 'grid grid-cols-[repeat(auto-fit,minmax(min(11.25rem,100%),1fr))] gap-3.5';

/** Gabarit v3 : colonne principale et colonne latérale sur desktop ; sur mobile, cartes empilées dans l'ordre `max-lg:order-N`. */
export const FORM_COLUMNS = 'flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_22.5rem]';
export const FORM_COLUMN = 'contents lg:flex lg:flex-col lg:gap-5';

/** Lien d'en-tête d'une carte (« + Plusieurs formats »), à droite du titre dans la bande teintée. */
export const HEADER_LINK =
  'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md text-[0.8125rem] font-semibold text-primary ' +
  'underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-primary/30';
