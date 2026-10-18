import Link from 'next/link';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title: string;
  /** Une ligne d'aide sous le titre, dans le bandeau (deux variantes possibles, desktop et mobile). */
  description?: ReactNode;
  rightLink?: { label: string; href: string };
  rightSlot?: ReactNode;
  /** L'en-tête passe sur deux lignes quand le contenu de droite ne tient pas (mobile). */
  wrap?: boolean;
  children: ReactNode;
}

export function SectionCard({ title, description, rightLink, rightSlot, wrap, children }: SectionCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className={cn('flex justify-between gap-3 px-5 py-4 border-b border-border header-band', description ? 'items-start' : 'items-center', wrap && 'flex-wrap gap-y-2.5')}>
        {description ? (
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">{description}</p>
          </div>
        ) : (
          <h2 className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
        )}
        {rightLink ? (
          <Link
            href={rightLink.href}
            className="text-[0.8125rem] font-semibold text-primary hover:underline shrink-0"
          >
            {rightLink.label}
          </Link>
        ) : rightSlot ? (
          <div className="shrink-0 text-[0.8125rem]">{rightSlot}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
