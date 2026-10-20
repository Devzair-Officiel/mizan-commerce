import { useId, type ReactNode } from 'react';

/** Attributs à poser sur le champ pour le relier à son libellé, son aide et son erreur. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  /** À côté du libellé, hors du nom du champ : badge d'état (« Détecté, à vérifier »), annoncé comme description. */
  badge?: ReactNode;
  /** Occupe toute la largeur de la grille de la section. */
  wide?: boolean;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Libellé au-dessus, champ, aide puis erreur dessous (reliées par aria-describedby).
 * L'astérisque est décoratif : le caractère obligatoire est annoncé par `aria-required`.
 */
export function FormField({ label, required, help, error, badge, wide, children }: FormFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const badgeId = badge ? `${id}-badge` : undefined;
  const describedBy = [badgeId, helpId, errorId].filter(Boolean).join(' ') || undefined;
  const labelEl = (
    <label htmlFor={id} className="text-[0.8125rem] font-medium text-foreground">
      {label}
      {required && <span className="ms-0.5 text-red-700 dark:text-red-400" aria-hidden>*</span>}
    </label>
  );

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${wide ? 'col-span-full' : ''}`}>
      {badge ? <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{labelEl}<span id={badgeId}>{badge}</span></div> : labelEl}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': required || undefined })}
      {help && <p id={helpId} className="text-xs text-muted-foreground">{help}</p>}
      {error && <p id={errorId} className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
