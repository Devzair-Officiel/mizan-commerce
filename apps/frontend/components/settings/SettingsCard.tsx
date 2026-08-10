import type { ComponentType, ReactNode } from 'react';

interface SettingsCardProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsCard({ icon: Icon, title, description, children }: SettingsCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      </header>
      <div className="flex flex-col gap-3 p-4">
        {description && (
          <p className="text-xs text-muted-foreground leading-snug -mt-1">{description}</p>
        )}
        {children}
      </div>
    </section>
  );
}
