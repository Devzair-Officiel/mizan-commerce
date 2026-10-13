import type { ReactNode } from 'react';

/** Carte du formulaire : section obligatoire en tête, puis sections repliables, séparées par une bordure. */
export function FormCard({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {children}
    </div>
  );
}
