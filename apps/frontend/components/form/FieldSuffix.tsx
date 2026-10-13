import type { ReactNode } from 'react';

/**
 * Unité affichée dans le champ, côté fin (« € / kg », « pièce »). Le champ enveloppé réserve la
 * place avec `pe-*` ; l'unité reste lisible par les lecteurs d'écran, juste après la valeur.
 */
export function FieldSuffix({ suffix, children }: { suffix: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute inset-y-0 inset-e-3.5 flex items-center text-sm text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}
