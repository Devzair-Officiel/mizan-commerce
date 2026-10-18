'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';
import { stepHref } from './stepNav';

interface StepLinkProps extends Omit<ComponentProps<typeof Link>, 'href' | 'onClick'> {
  id: string;
  step: number;
  onGo: (step: number) => void;
}

/**
 * Lien vers une étape de l'assistant : un vrai lien (nouvel onglet possible), mais un clic simple passe par
 * `onGo`, qui enregistre d'abord la saisie en cours.
 */
export function StepLink({ id, step, onGo, ...props }: StepLinkProps) {
  function go(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onGo(step);
  }

  return <Link href={stepHref(id, step)} onClick={go} {...props} />;
}
