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
