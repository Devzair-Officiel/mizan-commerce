import type { ReactNode } from 'react';

interface MenuSectionProps {
  title: string;
  children: ReactNode;
}

export function MenuSection({ title, children }: MenuSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 px-1.5 text-sm font-bold text-foreground tracking-[-0.005em]">
        {title}
      </h2>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {children}
      </div>
    </section>
  );
}
