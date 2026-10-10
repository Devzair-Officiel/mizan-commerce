import type { ReactNode } from 'react';

/**
 * Petit lien d'ajout du formulaire de commande (« + Remise », « + Frais de livraison »,
 * « + Ajouter une note »). Le « + » fait partie du libellé traduit : pas d'icône ici.
 * Cible tactile de 44 px sous lg.
 */
export function AddLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="self-start inline-flex items-center min-h-11 lg:min-h-0 text-[0.8125rem] font-semibold text-primary hover:underline">
      {children}
    </button>
  );
}
