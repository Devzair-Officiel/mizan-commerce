'use client';

import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Sections repliables d'un formulaire, toutes repliées à l'ouverture. `reveal(champ)` ouvre la
 * section du champ (rendu synchrone) puis lui donne le focus : erreur de validation ou du serveur.
 */
export function useFormSections<Field extends string, Section extends string>(
  sectionOf: Partial<Record<Field, Section>>,
  focus: (field: Field) => void,
) {
  const [open, setOpen] = useState<ReadonlySet<Section>>(() => new Set());

  const toggle = useCallback((section: Section) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(section)) next.add(section);
      return next;
    });
  }, []);

  const reveal = useCallback((field: Field) => {
    const section = sectionOf[field];
    if (section) flushSync(() => setOpen((prev) => (prev.has(section) ? prev : new Set(prev).add(section))));
    focus(field);
  }, [sectionOf, focus]);

  const isOpen = useCallback((section: Section) => open.has(section), [open]);
  return { isOpen, toggle, reveal };
}
