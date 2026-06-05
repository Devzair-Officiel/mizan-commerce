export function formatCompactRevenue(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

export function computeDelta(today: number, yesterday: number): { pct: number; positive: boolean } | null {
  if (yesterday <= 0) return null;
  const pct = ((today - yesterday) / yesterday) * 100;
  const rounded = Math.round(pct);
  return { pct: rounded, positive: rounded >= 0 };
}

export type RelativeAge = { unit: 'just_now' | 'minutes' | 'hours' | 'days'; count: number };

export function computeRelativeAge(timestamp: number): RelativeAge {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return { unit: 'just_now', count: 0 };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
}

export function computeZakatDays(annualDate: string | null): number | null {
  if (!annualDate) return null;
  const parts = annualDate.split('-');
  if (parts.length !== 3) return null;
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (Number.isNaN(month) || Number.isNaN(day)) return null;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), month, day);
  if (target < todayMidnight) {
    target = new Date(now.getFullYear() + 1, month, day);
  }
  const diff = Math.round((target.getTime() - todayMidnight.getTime()) / 86_400_000);
  return diff;
}
