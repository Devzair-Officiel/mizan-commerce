'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { COUNTRIES } from './CountryPicker';
import { qk } from '@/lib/query-keys';

export interface AddressResult {
  address_line: string;
  city: string;
  postal_code: string;
  country_code: string;
}

interface GeocodeFeature {
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

interface Suggestion {
  label: string;
  sub: string;
  result: AddressResult;
}

function formatSuggestion(f: GeocodeFeature): Suggestion {
  const p = f.properties;
  const parts: string[] = [];
  if (p.housenumber) parts.push(p.housenumber);
  if (p.street) parts.push(p.street);
  else if (p.name) parts.push(p.name);
  const address_line = parts.join(' ');
  const city = p.city ?? '';
  const postal_code = p.postcode ?? '';
  const country_code = (p.country_code ?? '').toUpperCase();
  const label = address_line || city;
  const sub = [postal_code, city, p.country].filter(Boolean).join(', ');
  return { label, sub, result: { address_line, city, postal_code, country_code } };
}

async function fetchSuggestions(query: string, country: string): Promise<Suggestion[]> {
  const params = new URLSearchParams({ q: query });
  if (country) params.set('country', country);
  const res = await fetch(`/api/geocode?${params.toString()}`);
  if (!res.ok) throw new Error('Geocoding failed');
  const json: { features?: GeocodeFeature[] } = await res.json();
  return (json.features ?? []).map(formatSuggestion).filter((s) => s.label);
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  countryCode?: string;
}

export function AddressAutocomplete({ value, onChange, onSelect, countryCode }: AddressAutocompleteProps) {
  const [dismissed, setDismissed] = useState(true);
  const [selected, setSelected] = useState(false);
  const [debouncedValue, setDebouncedValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedCountry = countryCode?.trim().toUpperCase() || '';
  const countryName = normalizedCountry
    ? COUNTRIES.find((c) => c.code === normalizedCountry)?.name ?? ''
    : '';

  // Debounce de la saisie utilisateur — évite de spammer MapTiler.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), 320);
    return () => clearTimeout(t);
  }, [value]);

  const enabled = !selected && debouncedValue.length >= 3;
  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: qk.geocode.query(debouncedValue, normalizedCountry),
    queryFn: () => fetchSuggestions(debouncedValue, normalizedCountry),
    enabled,
    // Garder les anciennes suggestions visibles pendant la frappe suivante.
    placeholderData: keepPreviousData,
    // Les adresses ne changent pas — cache long pour réduire les appels.
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const emptyForCountry = enabled && Boolean(normalizedCountry) && suggestions.length === 0 && !isFetching;
  const open = !dismissed && !selected && (suggestions.length > 0 || emptyForCountry);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDismissed(true);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleSelect(item: Suggestion) {
    onChange(item.result.address_line || item.label);
    onSelect(item.result);
    setSelected(true);
    setDismissed(true);
  }

  function handleChange(v: string) {
    setSelected(false);
    setDismissed(false);
    onChange(v);
  }

  function handleClear() {
    onChange('');
    setSelected(false);
    setDismissed(true);
  }

  const loading = isFetching && enabled;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border bg-card px-3 transition-colors ${
          open ? 'border-primary' : 'border-border'
        }`}
      >
        {loading ? (
          <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <MapPin
            size={16}
            className={`shrink-0 transition-colors ${selected ? 'text-primary' : 'text-muted-foreground'}`}
          />
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setDismissed(false); }}
          placeholder="Adresse (optionnel)"
          className="flex-1 bg-transparent py-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Effacer l'adresse"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (suggestions.length > 0 || emptyForCountry) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          {emptyForCountry && suggestions.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Aucune adresse trouvée {countryName ? `en ${countryName}` : ''}. Essayez d&apos;élargir
              la recherche ou changez de pays.
            </p>
          )}
          {suggestions.map((item, idx) => (
            <button
              key={`${idx}|${item.label}|${item.sub}`}
              type="button"
              onClick={() => handleSelect(item)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-muted hover:bg-muted/60 border-t border-border first:border-t-0"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <MapPin size={13} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
