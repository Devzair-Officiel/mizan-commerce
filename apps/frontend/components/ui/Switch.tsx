'use client';

import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nom accessible : l'interrupteur n'a pas de libellé visible à côté de lui. */
  label: string;
  disabled?: boolean;
}

/** Interrupteur (rôle `switch`) : 40 × 24 visibles, cible tactile de 44 px. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group relative inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none disabled:opacity-50"
    >
      <span
        aria-hidden
        className={cn(
          'relative h-6 w-10 rounded-full transition-colors group-focus-visible:ring-3 group-focus-visible:ring-ring/50',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.75 size-4.5 rounded-full bg-card shadow-sm transition-[inset-inline-start] motion-reduce:transition-none',
            checked ? 'inset-s-4.75' : 'inset-s-0.75',
          )}
        />
      </span>
    </button>
  );
}
