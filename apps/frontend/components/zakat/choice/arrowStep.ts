import type { KeyboardEvent } from 'react';

const NEXT_KEYS = { ltr: ['ArrowDown', 'ArrowRight'], rtl: ['ArrowDown', 'ArrowLeft'] } as const;
const PREVIOUS_KEYS = { ltr: ['ArrowUp', 'ArrowLeft'], rtl: ['ArrowUp', 'ArrowRight'] } as const;

/** Groupe de boutons radio : +1 / -1 selon la flèche (sens de lecture compris), 0 pour une autre touche. */
export function arrowStep(event: KeyboardEvent<HTMLElement>): -1 | 0 | 1 {
  const dir = getComputedStyle(event.currentTarget).direction === 'rtl' ? 'rtl' : 'ltr';
  if ((NEXT_KEYS[dir] as readonly string[]).includes(event.key)) return 1;
  if ((PREVIOUS_KEYS[dir] as readonly string[]).includes(event.key)) return -1;
  return 0;
}
