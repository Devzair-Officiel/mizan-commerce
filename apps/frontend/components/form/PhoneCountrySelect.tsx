'use client';

import { useMemo } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Search } from 'lucide-react';
import { countryFlag } from '@/lib/countryFlag';
import { useCountryNames } from '@/lib/hooks/useCountryNames';

interface DialCode {
  code: CountryCode;
  name: string;
  /** Indicatif sans le « + » (« 212 »). */
  dial: string;
}

/** Sans casse ni accents : « reunion » trouve « La Réunion ». */
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Recherche par nom de pays, code ISO ou indicatif (« +212 », « 212 », « 00212 »). */
function matches(item: DialCode, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const digits = q.replace(/^\+|^00/, '').replace(/\D/g, '');
  if (/^[+\d\s]+$/.test(q)) return digits !== '' && item.dial.startsWith(digits);
  return fold(item.name).includes(q) || item.code.toLowerCase() === q;
}

interface PhoneCountrySelectProps {
  value: CountryCode;
  onChange: (code: CountryCode) => void;
  /** À côté d'un champ à libellé flottant (coins plus arrondis). */
  floating?: boolean;
}

/**
 * Indicatif du pays, à placer devant le champ téléphone (même hauteur, dans une rangée flex) :
 * drapeau et indicatif, liste filtrée par nom de pays ou par indicatif, au clavier.
 */
export function PhoneCountrySelect({ value, onChange, floating }: PhoneCountrySelectProps) {
  const t = useTranslations('ui.phone');
  const countryName = useCountryNames();
  const items = useMemo<DialCode[]>(
    () => getCountries()
      .map((code) => ({ code, name: countryName(code), dial: getCountryCallingCode(code) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [countryName],
  );
  const selected = items.find((item) => item.code === value) ?? null;

  return (
    <Combobox.Root items={items} value={selected} onValueChange={(item) => { if (item) onChange(item.code); }}
      itemToStringLabel={(item) => item.name} isItemEqualToValue={(a, b) => a.code === b.code} filter={matches}>
      <Combobox.Trigger aria-label={selected ? t('country_value', { country: selected.name, dial: selected.dial }) : t('country_label')} dir="ltr"
        className={`${floating ? 'rounded-2xl' : 'rounded-xl'} flex min-h-11 shrink-0 items-center gap-1.5 self-stretch border border-border bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] hover:bg-muted/50 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 data-popup-open:border-primary`}>
        <span className="text-lg leading-none" aria-hidden>{countryFlag(value)}</span>
        <span className="tabular-nums">+{selected?.dial}</span>
        <ChevronDown size={14} className="text-muted-foreground" aria-hidden />
      </Combobox.Trigger>
      <Combobox.Portal>
        {/* Au-dessus des fenêtres du bas (z-70), où le formulaire s'ouvre aussi. */}
        <Combobox.Positioner sideOffset={4} align="start" className="z-90">
          <Combobox.Popup aria-label={t('country_label')}
            className="flex max-h-(--available-height) w-72 max-w-(--available-width) flex-col rounded-xl border border-border bg-card shadow-lg outline-none">
            <div className="relative border-b border-border p-1">
              <Search size={15} className="pointer-events-none absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Combobox.Input placeholder={t('search_placeholder')}
                className="h-10 w-full rounded-lg bg-transparent ps-8.5 pe-3 text-sm text-foreground outline-none placeholder:text-muted-foreground" />
            </div>
            <Combobox.Empty className="px-3 py-4 text-sm text-muted-foreground empty:hidden">{t('search_empty')}</Combobox.Empty>
            <Combobox.List className="min-h-0 flex-1 overflow-y-auto p-1 empty:hidden">
              {(item: DialCode) => (
                <Combobox.Item key={item.code} value={item}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm text-foreground outline-none data-highlighted:bg-muted data-selected:font-semibold">
                  <span className="text-lg leading-none" aria-hidden>{countryFlag(item.code)}</span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span dir="ltr" className="tabular-nums text-muted-foreground">+{item.dial}</span>
                  <Combobox.ItemIndicator className="flex text-primary"><Check size={15} aria-hidden /></Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
