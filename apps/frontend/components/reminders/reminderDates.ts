/**
 * Échéances proposées (Reporter, raccourcis du formulaire) et champs date/heure, à l'heure de la
 * boutique (`timeZone`, fuseau IANA) et non de l'appareil : comme les regroupements de la liste.
 */

interface Wall { year: number; month: number; day: number; hour: number; minute: number }

/** Date et heure affichées par une horloge du fuseau `timeZone` à l'instant `d`. */
function wallClock(d: Date, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** Écart (ms) entre l'heure du fuseau et l'heure UTC à l'instant `ms`. */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallClock(new Date(ms), timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(ms / 60000) * 60000;
}

/** Instant où l'horloge du fuseau affiche cette date et cette heure (jour et mois débordants admis). */
function zoned(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const guess = asUtc - offsetAt(asUtc, timeZone);
  // Second passage : l'écart peut changer entre les deux instants (heure d'été).
  return new Date(asUtc - offsetAt(guess, timeZone));
}

function at(days: number, hours: number, timeZone: string): Date {
  const w = wallClock(new Date(), timeZone);
  return zoned(w.year, w.month, w.day + days, hours, 0, timeZone);
}

export function inOneHour(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

export function todayAt(hours: number, timeZone: string): Date {
  return at(0, hours, timeZone);
}

export function tomorrowAt(hours: number, timeZone: string): Date {
  return at(1, hours, timeZone);
}

/** Lundi prochain (dans 7 jours si l'on est lundi). */
export function nextMondayAt(hours: number, timeZone: string): Date {
  const w = wallClock(new Date(), timeZone);
  const day = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return at(((8 - day) % 7) || 7, hours, timeZone);
}

export function inOneWeekAt(hours: number, timeZone: string): Date {
  return at(7, hours, timeZone);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** « 2026-10-13 » et « 09:30 » : valeurs des champs date et heure natifs. */
export function toDateInput(d: Date, timeZone: string): string {
  const w = wallClock(d, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

export function toTimeInput(d: Date, timeZone: string): string {
  const w = wallClock(d, timeZone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** Date et heure saisies → instant ISO ; null si l'une manque. */
export function fromInputs(date: string, time: string, timeZone: string): string | null {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) return null;
  if ([hour, minute].some(Number.isNaN)) return null;
  return zoned(year, month, day, hour, minute, timeZone).toISOString();
}
