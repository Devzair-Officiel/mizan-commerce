'use client';

import { useState } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { Sparkles, ChevronDown } from 'lucide-react';
import { FloatingSelect } from '@/components/ui/floating-fields';
import type { SettingsFormValues } from './schema';

interface PreferencesSectionProps {
  register: UseFormRegister<SettingsFormValues>;
}

export function PreferencesSection({ register }: PreferencesSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Préférences avancées
        </h2>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs text-muted-foreground leading-snug -mt-1">
            Type d&apos;activité et style du tableau de bord.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FloatingSelect id="catalog_kind" label="Type d'activité" {...register('catalog_kind')}>
              <option value="products">Produits</option>
              <option value="services">Services</option>
              <option value="both">Les deux</option>
            </FloatingSelect>
            <FloatingSelect id="dashboard_mode" label="Tableau de bord" {...register('dashboard_mode')}>
              <option value="minimal">Minimaliste</option>
              <option value="complete">Complet</option>
            </FloatingSelect>
          </div>
        </div>
      )}
    </section>
  );
}
