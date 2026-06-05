import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatRelative } from './utils';

interface FreshIndicatorProps {
  updatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
}

export function FreshIndicator({ updatedAt, isFetching, onRefresh }: FreshIndicatorProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const label = isFetching ? 'Actualisation…' : updatedAt ? formatRelative(updatedAt) : '';

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-60 shrink-0"
      aria-label="Actualiser"
    >
      <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
