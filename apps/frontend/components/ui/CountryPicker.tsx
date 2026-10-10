'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Search, X } from 'lucide-react';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { useCountryNames } from '@/lib/hooks/useCountryNames';
import { BottomSheet } from './BottomSheet';

/** Pays proposés, dans l'ordre d'affichage (pays francophones et du Maghreb d'abord). */
const COUNTRY_CODES = [
  'FR', 'BE', 'CH', 'LU', 'MC', 'MA', 'DZ', 'TN', 'SN', 'CI',
  'CM', 'ML', 'BF', 'GN', 'GA', 'CD', 'CG', 'MG', 'RE', 'GP',
  'MQ', 'GF', 'MU', 'KM', 'LB', 'EG', 'TR', 'SA', 'AE', 'QA',
  'DE', 'ES', 'IT', 'PT', 'GB', 'NL', 'US', 'CA', 'BR', 'MX',
  'CN', 'JP', 'IN', 'AU',
];

function flag(code: string) {
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(127397 + c.charCodeAt(0))
  );
}

interface CountryPickerProps {
  value: string;
  onChange: (code: string) => void;
  /** Relie le déclencheur au libellé et à l'aide du champ. */
  id?: string;
  'aria-describedby'?: string;
}

export function CountryPicker({ value, onChange, id, 'aria-describedby': describedBy }: CountryPickerProps) {
  const t = useTranslations('ui.country');
  const countryName = useCountryNames();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const close = () => { setOpen(false); setSearch(''); };

  const query = search.trim().toLowerCase();
  const filtered = query
    ? COUNTRY_CODES.filter((code) => countryName(code).toLowerCase().includes(query) || code.toLowerCase().includes(query))
    : COUNTRY_CODES;

  return (
    <>
      {/* Le bouton « retirer » est à côté du déclencheur, pas dedans : un bouton n'en contient pas un autre. */}
      <div className="relative">
        <button type="button" id={id} aria-describedby={describedBy} aria-haspopup="dialog" onClick={() => setOpen(true)}
          className={`${FIELD_CONTROL} flex items-center gap-2 pe-11 text-start`}>
          {value ? (
            <>
              <span className="text-lg leading-none" aria-hidden>{flag(value)}</span>
              <span className="flex-1 truncate">{countryName(value)}</span>
            </>
          ) : (
            <span className="flex-1 truncate text-muted-foreground">{t('placeholder')}</span>
          )}
        </button>
        {value ? (
          <button type="button" onClick={() => onChange('')} aria-label={t('clear')}
            className="absolute inset-y-0 inset-e-0 flex w-11 items-center justify-center rounded-e-xl text-muted-foreground hover:text-foreground">
            <X size={14} aria-hidden />
          </button>
        ) : (
          <ChevronDown size={15} className="pointer-events-none absolute inset-e-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        )}
      </div>

      <BottomSheet open={open} onClose={close} title={t('sheet_title')}>
        <div className="relative mb-3">
          <Search size={15} className="absolute inset-s-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} aria-label={t('search')}
            className="w-full rounded-xl border border-border bg-muted py-2.5 ps-9 pe-3 text-sm outline-none focus:border-primary" />
        </div>
        <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto">
          {filtered.map((code) => (
            <button key={code} type="button" onClick={() => { onChange(code); close(); }} aria-pressed={value === code}
              className={`flex min-h-12 items-center gap-3 px-1 text-sm transition-colors active:bg-muted ${value === code ? 'font-semibold text-primary' : 'text-foreground'}`}>
              <span className="w-8 text-center text-2xl leading-none" aria-hidden>{flag(code)}</span>
              <span className="flex-1 text-start">{countryName(code)}</span>
              {value === code && <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
            </button>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>}
        </div>
      </BottomSheet>
    </>
  );
}
