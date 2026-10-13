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
  /** Occupe toute la largeur de la grille de la section. */
  wide?: boolean;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Libellé au-dessus, champ, aide puis erreur dessous (reliées par aria-describedby).
 * L'astérisque est décoratif : le caractère obligatoire est annoncé par `aria-required`.
 */
export function FormField({ label, required, help, error, wide, children }: FormFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${wide ? 'col-span-full' : ''}`}>
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-foreground">
        {label}
        {required && <span className="ms-0.5 text-red-700 dark:text-red-400" aria-hidden>*</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': required || undefined })}
      {help && <p id={helpId} className="text-xs text-muted-foreground">{help}</p>}
      {error && <p id={errorId} className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
