'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';
import { COUNTRIES } from './CountryPicker';

export interface AddressResult {
  address_line: string;
  city: string;
  postal_code: string;
  country_code: string;
}

// Format renvoyé par notre route handler `/api/geocode` (normalisé MapTiler).
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

function formatSuggestion(f: GeocodeFeature): { label: string; sub: string; result: AddressResult } {
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

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  countryCode?: string;
}

export function AddressAutocomplete({ value, onChange, onSelect, countryCode }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<ReturnType<typeof formatSuggestion>[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedCountry = countryCode?.trim().toUpperCase() || '';
  const countryName = normalizedCountry
    ? COUNTRIES.find(c => c.code === normalizedCountry)?.name ?? ''
    : '';
  const [emptyForCountry, setEmptyForCountry] = useState(false);

  useEffect(() => {
    if (selected) return;
    if (value.length < 3) { setSuggestions([]); setOpen(false); setEmptyForCountry(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        // Proxy server-side : /api/geocode applique le filtre pays côté MapTiler.
        const params = new URLSearchParams({ q: value });
        if (normalizedCountry) params.set('country', normalizedCountry);
        const res = await fetch(`/api/geocode?${params.toString()}`);
        const json = await res.json();
        const items = (json.features as GeocodeFeature[])
          .map(formatSuggestion)
          .filter(s => s.label);
        setSuggestions(items);
        setEmptyForCountry(Boolean(normalizedCountry) && items.length === 0);
        setOpen(items.length > 0 || (Boolean(normalizedCountry) && items.length === 0));
      } catch {
        setSuggestions([]);
        setEmptyForCountry(false);
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, selected, normalizedCountry]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleSelect(item: ReturnType<typeof formatSuggestion>) {
    onChange(item.result.address_line || item.label);
    onSelect(item.result);
    setSelected(true);
    setOpen(false);
    setSuggestions([]);
  }

  function handleChange(v: string) {
    setSelected(false);
    onChange(v);
  }

  function handleClear() {
    onChange('');
    setSelected(false);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center gap-2 rounded-xl border bg-card px-3 transition-colors ${open ? 'border-primary' : 'border-border'}`}>
        {loading
          ? <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />
          : <MapPin size={16} className={`shrink-0 transition-colors ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
        }
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Adresse (optionnel)"
          className="flex-1 bg-transparent py-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {value && (
          <button type="button" onClick={handleClear} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown suggestions */}
      {open && (suggestions.length > 0 || emptyForCountry) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          {emptyForCountry && suggestions.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Aucune adresse trouvée {countryName ? `en ${countryName}` : ''}. Essayez d'élargir la recherche ou changez de pays.
            </p>
          )}
          {suggestions.map((item) => (
            <button
              key={`${item.label}|${item.sub}`}
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
