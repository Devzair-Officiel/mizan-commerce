import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { phoneCountry } from '@/lib/phone';

export const compactIdentifier = (value: string): string => value.replace(/\s/g, '');

export function formatSiret(value: string): string {
  const s = compactIdentifier(value);
  return /^\d{14}$/.test(s) ? `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}` : value;
}

export function formatIban(value: string): string {
  return compactIdentifier(value).match(/.{1,4}/g)?.join(' ') ?? '';
}

export function formatVatNumber(value: string): string {
  const s = compactIdentifier(value);
  if (/^FR[A-Z0-9]{2}\d{9}$/i.test(s)) return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7, 10)} ${s.slice(10)}`;
  return /^[A-Z]{2}[A-Z0-9]+$/i.test(s) ? `${s.slice(0, 2)} ${s.slice(2).match(/.{1,3}/g)?.join(' ') ?? ''}` : value;
}

export function formatTaxId(value: string): string {
  const compact = compactIdentifier(value);
  if (/^\d{14}$/.test(compact)) return formatSiret(value);
  return /^([A-Z]{2}[0-9]+|FR[A-Z0-9]{2}[0-9]{9})$/i.test(compact) ? formatVatNumber(value) : value;
}

export function formatInvoicePhone(value: string, country: string): string {
  const phone = parsePhoneNumberFromString(value, phoneCountry(country));
  return phone?.isValid() ? phone.formatInternational() : value;
}

export function validIban(value: string): boolean {
  const s = compactIdentifier(value).toUpperCase();
  if (!s) return true;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
