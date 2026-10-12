import { getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** Pays d'indicatif par défaut : celui de la boutique s'il est connu, sinon la France. */
export function phoneCountry(code: string | null | undefined): CountryCode {
  const upper = (code ?? '').toUpperCase();
  return isSupportedCountry(upper) ? upper : 'FR';
}

/**
 * Numéro enregistré (E.164) → pays de l'indicatif et numéro national affiché (« 06 12 34 56 78 »).
 * Un numéro sans pays reconnu reste tel quel, sans pays : le formulaire prend celui de la boutique.
 */
export function splitPhone(value: string): { country: CountryCode | undefined; national: string } {
  const parsed = value.trim() ? parsePhoneNumberFromString(value) : undefined;
  if (!parsed?.country) return { country: undefined, national: value };
  return { country: parsed.country, national: parsed.formatNational() };
}

/**
 * Numéro complet envoyé au serveur : le numéro national dans le pays choisi (E.164 quand il est
 * lisible, sinon précédé de l'indicatif : le serveur le refusera). Un numéro saisi avec son
 * indicatif (+…, 00…) est gardé tel quel. Le serveur renormalise dans tous les cas.
 */
export function joinPhone(country: CountryCode, national: string): string {
  const raw = national.trim();
  if (!raw || /^(\+|00)/.test(raw)) return raw;
  return parsePhoneNumberFromString(raw, country)?.number ?? `+${getCountryCallingCode(country)} ${raw}`;
}
