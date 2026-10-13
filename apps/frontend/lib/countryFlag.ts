/** Drapeau emoji d'un pays (code ISO 3166-1 alpha-2). */
export function countryFlag(code: string): string {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
