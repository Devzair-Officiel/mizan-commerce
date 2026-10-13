/** Échéances proposées (Reporter, raccourcis du formulaire), à l'heure de l'appareil. */

function at(days: number, hours: number, from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(hours, 0, 0, 0);
  return d;
}

export function inOneHour(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

export function todayAt(hours: number): Date {
  return at(0, hours);
}

export function tomorrowAt(hours: number): Date {
  return at(1, hours);
}

/** Lundi prochain (dans 7 jours si l'on est lundi). */
export function nextMondayAt(hours: number): Date {
  const day = new Date().getDay();
  return at(((8 - day) % 7) || 7, hours);
}

export function inOneWeekAt(hours: number): Date {
  return at(7, hours);
}

/** « 2026-10-13 » et « 09:30 » : valeurs des champs date et heure natifs. */
export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date et heure saisies → instant ISO ; null si l'une manque. */
export function fromInputs(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
