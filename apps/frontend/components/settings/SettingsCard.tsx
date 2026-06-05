import type { ComponentType, ReactNode } from 'react';

interface SettingsCardProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsCard({ icon: Icon, title, description, children }: SettingsCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col min-w-0 pt-0.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground leading-snug">{description}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {children}
      </div>
    </section>
  );
}
