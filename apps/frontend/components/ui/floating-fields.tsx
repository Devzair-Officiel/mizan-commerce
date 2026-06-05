'use client';

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { Select } from '@base-ui/react/select';

/* ── styles partagés ── */
const inputBase =
  'peer w-full rounded-2xl border border-border bg-card px-4 pt-5 pb-2 text-sm text-foreground ' +
  'transition-[border-color,box-shadow] duration-200 outline-none ' +
  'focus:border-primary focus:ring-1 focus:ring-primary/20 ' +
  'disabled:opacity-50';

const labelBase =
  'pointer-events-none absolute inset-s-4 text-muted-foreground transition-all duration-200 select-none';

const labelCentered = 'top-1/2 -translate-y-1/2 text-sm';
const labelFloated  = 'top-1.75 translate-y-0 text-[11px]';

/* ─────────────────────────────────────────────
   FloatingInput
───────────────────────────────────────────── */
interface FloatingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  /** Texte affiché en gris à droite du champ (ex: "€/kg", "kg"). */
  suffix?: ReactNode;
}

export function FloatingInput({ label, id, required, className, suffix, ...props }: FloatingInputProps) {
  const hasSuffix = Boolean(suffix);
  return (
    <div className="relative">
      <input
        id={id}
        placeholder=" "
        className={`${inputBase} ${hasSuffix ? 'pe-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''} ${className ?? ''}`}
        {...props}
      />
      <label
        htmlFor={id}
        className={`
          ${labelBase} ${labelCentered}
          ${hasSuffix ? 'inset-e-20 truncate' : ''}
          peer-focus:top-1.75 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-primary
          peer-[:not(:placeholder-shown)]:top-1.75
          peer-[:not(:placeholder-shown)]:translate-y-0
          peer-[:not(:placeholder-shown)]:text-[11px]
        `}
      >
        {label}{required && <span className="text-destructive ms-0.5">*</span>}
      </label>
      {hasSuffix && (
        <span className="pointer-events-none absolute inset-e-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground tabular-nums">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   FloatingSelect — label toujours en haut
   (un select affiche toujours une valeur visible,
   centrer le label causerait un chevauchement)
───────────────────────────────────────────── */
interface FloatingSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  children: ReactNode;
}

export function FloatingSelect({ label, id, children, className, ...props }: FloatingSelectProps) {
  return (
    <div className="relative">
      <select
        id={id}
        className={`peer ${inputBase} appearance-none pe-8 ${className ?? ''}`}
        {...props}
      >
        {children}
      </select>
      {/* Chevron */}
      <span className="pointer-events-none absolute inset-e-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
      <label
        htmlFor={id}
        className={`${labelBase} ${labelFloated} peer-focus:text-primary`}
      >
        {label}
      </label>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FloatingSelectBase — dropdown stylé (Base UI)
   À utiliser pour les listes longues / dynamiques
───────────────────────────────────────────── */
interface FloatingSelectBaseProps {
  label: ReactNode;
  id?: string;
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  children: ReactNode;
  selectItems?: { value: string; label: string }[];
  className?: string;
}

export function FloatingSelectBase({ label, id, value, onValueChange, placeholder, children, selectItems, className }: FloatingSelectBaseProps) {
  return (
    <Select.Root value={value || null} onValueChange={(v) => onValueChange(v ?? '')} items={selectItems}>
      <div className="relative">
        <Select.Trigger
          id={id}
          className={`${inputBase} appearance-none pe-8 text-start w-full ${className ?? ''}`}
        >
          <Select.Value placeholder={placeholder ?? '—'} />
          <Select.Icon className="pointer-events-none absolute inset-e-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <label
          htmlFor={id}
          className={`${labelBase} ${labelFloated} peer-focus:text-primary`}
        >
          {label}
        </label>
      </div>
      <Select.Portal>
        <Select.Positioner sideOffset={4} align="start" style={{ width: 'var(--anchor-width)' }}>
          <Select.Popup className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden overflow-y-auto max-h-64 z-50">
            {children}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function FloatingSelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Select.Item
      value={value}
      className="flex items-center px-4 py-3 text-sm text-foreground cursor-pointer border-b border-border/50 last:border-0 data-highlighted:bg-primary/8 data-selected:font-semibold data-selected:text-primary"
    >
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
}

/* ─────────────────────────────────────────────
   FloatingTextarea
───────────────────────────────────────────── */
interface FloatingTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function FloatingTextarea({ label, id, className, ...props }: FloatingTextareaProps) {
  return (
    <div className="relative">
      <textarea
        id={id}
        placeholder=" "
        className={`
          peer w-full rounded-2xl border border-border bg-card px-4 pt-7 pb-3 text-sm text-foreground
          transition-[border-color,box-shadow] duration-200 outline-none resize-none
          focus:border-primary focus:ring-1 focus:ring-primary/20
          ${className ?? ''}
        `}
        {...props}
      />
      <label
        htmlFor={id}
        className={`
          ${labelBase} top-3.5 text-sm
          peer-focus:top-1.75 peer-focus:text-[11px] peer-focus:text-primary
          peer-[:not(:placeholder-shown)]:top-1.75
          peer-[:not(:placeholder-shown)]:text-[11px]
        `}
      >
        {label}
      </label>
    </div>
  );
}
