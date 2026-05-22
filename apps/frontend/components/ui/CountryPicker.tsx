'use client';

import { useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'FR', name: 'France' },
  { code: 'BE', name: 'Belgique' },
  { code: 'CH', name: 'Suisse' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MA', name: 'Maroc' },
  { code: 'DZ', name: 'Algérie' },
  { code: 'TN', name: 'Tunisie' },
  { code: 'SN', name: 'Sénégal' },
  { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'CM', name: 'Cameroun' },
  { code: 'ML', name: 'Mali' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'GN', name: 'Guinée' },
  { code: 'GA', name: 'Gabon' },
  { code: 'CD', name: 'RD Congo' },
  { code: 'CG', name: 'Congo' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'RE', name: 'La Réunion' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'GF', name: 'Guyane' },
  { code: 'MU', name: 'Maurice' },
  { code: 'KM', name: 'Comores' },
  { code: 'LB', name: 'Liban' },
  { code: 'EG', name: 'Égypte' },
  { code: 'TR', name: 'Turquie' },
  { code: 'SA', name: 'Arabie Saoudite' },
  { code: 'AE', name: 'Émirats arabes unis' },
  { code: 'QA', name: 'Qatar' },
  { code: 'DE', name: 'Allemagne' },
  { code: 'ES', name: 'Espagne' },
  { code: 'IT', name: 'Italie' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GB', name: 'Royaume-Uni' },
  { code: 'NL', name: 'Pays-Bas' },
  { code: 'US', name: 'États-Unis' },
  { code: 'CA', name: 'Canada' },
  { code: 'BR', name: 'Brésil' },
  { code: 'MX', name: 'Mexique' },
  { code: 'CN', name: 'Chine' },
  { code: 'JP', name: 'Japon' },
  { code: 'IN', name: 'Inde' },
  { code: 'AU', name: 'Australie' },
];

function flag(code: string) {
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(127397 + c.charCodeAt(0))
  );
}

interface CountryPickerProps {
  value: string;
  onChange: (code: string) => void;
}

export function CountryPicker({ value, onChange }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = COUNTRIES.find(c => c.code === value);

  const filtered = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  function handleSelect(code: string) {
    onChange(code);
    setOpen(false);
    setSearch('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
  }

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="relative flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-3.5 text-sm transition-colors active:bg-muted"
      >
        {selected ? (
          <>
            <span className="text-xl leading-none">{flag(selected.code)}</span>
            <span className="flex-1 text-left text-foreground">{selected.name}</span>
            <span
              role="button"
              onClick={handleClear}
              className="text-muted-foreground p-0.5"
            >
              <X size={14} />
            </span>
          </>
        ) : (
          <>
            <span className="flex-1 text-left text-muted-foreground">Pays (optionnel)</span>
            <ChevronDown size={15} className="text-muted-foreground" />
          </>
        )}
      </div>

      <BottomSheet open={open} onClose={() => { setOpen(false); setSearch(''); }} title="Choisir un pays">
        {/* Recherche */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full rounded-xl border border-border bg-muted py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Liste */}
        <div className="flex flex-col divide-y divide-border overflow-y-auto max-h-72">
          {filtered.map(country => (
            <button
              key={country.code}
              type="button"
              onClick={() => handleSelect(country.code)}
              className={`flex items-center gap-3 px-1 py-3 text-sm transition-colors active:bg-muted ${
                value === country.code ? 'text-primary font-semibold' : 'text-foreground'
              }`}
            >
              <span className="text-2xl leading-none w-8 text-center">{flag(country.code)}</span>
              <span className="flex-1 text-left">{country.name}</span>
              {value === country.code && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
