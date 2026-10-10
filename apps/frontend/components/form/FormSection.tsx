import { useId, type ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  /** Une phrase qui dit à quoi servent les champs. */
  description: string;
  children: ReactNode;
}

/**
 * Section de formulaire. Desktop : titre et explication à gauche, champs à droite en grille
 * auto-fit (13.75rem min). Sous lg : titre et explication au-dessus des champs.
 */
export function FormSection({ title, description, children }: FormSectionProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="grid gap-4 p-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 lg:p-6">
      <div>
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-[0.8125rem] text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(13.75rem,100%),1fr))] gap-4">
        {children}
      </div>
    </section>
  );
}
