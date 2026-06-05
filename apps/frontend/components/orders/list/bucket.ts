import type { Bucket } from './constants';

const TIME_FMT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const SHORT_DATE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

export function bucketOf(iso: string): Bucket {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOf = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor((startToday - startOf) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 6) return 'this_week';
  return 'older';
}

export function rowDate(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  if (bucket === 'today' || bucket === 'yesterday') return TIME_FMT.format(d);
  return SHORT_DATE_FMT.format(d);
}
