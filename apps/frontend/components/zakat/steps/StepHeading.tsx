import type { ReactNode } from 'react';

/** Mobile : titre de l'étape et phrase d'appui, sous l'indicateur d'étape (desktop : les cartes portent leur titre). */
export function StepHeading({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <div className="lg:hidden">
      <h2 className="mt-1 text-[1.375rem] leading-tight font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 text-[0.84375rem] leading-normal text-muted-foreground">{lead}</p>
      {children}
    </div>
  );
}
