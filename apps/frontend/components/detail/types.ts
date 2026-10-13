import type { ComponentType } from 'react';

/** Une action d'une page de détail : bouton principal, entrée du menu « ⋯ » ou de la feuille mobile. */
export interface DetailAction<K extends string = string> {
  key: K;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  onSelect?: () => void;
  /** Lien à ouvrir dans un nouvel onglet (PDF de la facture) au lieu d'un geste. */
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
}

export interface DetailMenuActions<K extends string = string> {
  /** Actions ordinaires, dans l'ordre d'affichage. */
  items: DetailAction<K>[];
  /** Action dangereuse, après un séparateur. */
  danger: DetailAction<K> | null;
}
