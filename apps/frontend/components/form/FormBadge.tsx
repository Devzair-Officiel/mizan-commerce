import type { ReactNode } from 'react';

const TONE = {
  required: 'bg-secondary text-secondary-foreground',
  optional: 'bg-muted text-muted-foreground',
} as const;

/** Pastille « Obligatoire » / « Facultatif » à côté du titre d'une section. */
export function FormBadge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span className={`inline-flex h-5.5 shrink-0 items-center rounded-full px-2 text-[0.6875rem] font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  );
}
