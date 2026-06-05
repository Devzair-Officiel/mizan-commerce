import { AlertCircle } from 'lucide-react';

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-[11px] text-destructive px-1">
      <AlertCircle size={11} className="shrink-0" />
      {message}
    </p>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
      {children}
    </h2>
  );
}
