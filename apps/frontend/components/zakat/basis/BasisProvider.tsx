'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { BasisChoices, BasisView } from './basisCatalog';
import { BasisSheet } from './BasisSheet';

const OpenBasis = createContext<((view: BasisView) => void) | null>(null);

/** Ouvre une fiche Fondement ; null hors d'un `BasisProvider` (les liens ne s'affichent pas). */
export function useOpenBasis() { return useContext(OpenBasis); }

/** Tiroir des fiches Fondement d'un écran ; `choices` marque « Votre choix » dans les avis. */
export function BasisProvider({ choices, children }: { choices: BasisChoices; children: ReactNode }) {
  const [view, setView] = useState<BasisView | null>(null);
  const close = useCallback(() => setView(null), []);
  return (
    <OpenBasis.Provider value={setView}>
      {children}
      <BasisSheet view={view} choices={choices} onView={setView} onClose={close} />
    </OpenBasis.Provider>
  );
}
