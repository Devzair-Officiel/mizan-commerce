/** Champ du gabarit de formulaire : h-11, rounded-xl, bordure rouge quand `aria-invalid`. */
export const FIELD_CONTROL =
  'h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3.5 text-sm text-foreground ' +
  'outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground ' +
  'focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 ' +
  'aria-invalid:border-red-600 aria-invalid:focus-visible:ring-red-600/20 dark:aria-invalid:border-red-400';

/** Zone de texte : mêmes bordures que le champ, hauteur libre. */
export const FIELD_TEXTAREA = `${FIELD_CONTROL.replace('h-11', 'min-h-24')} resize-y py-2.5`;
