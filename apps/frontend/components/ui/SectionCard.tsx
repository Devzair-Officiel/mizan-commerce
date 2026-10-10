import Link from 'next/link';
import { type ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  rightLink?: { label: string; href: string };
  rightSlot?: ReactNode;
  children: ReactNode;
}

export function SectionCard({ title, rightLink, rightSlot, children }: SectionCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{title}</h2>
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
