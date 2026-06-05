import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-zinc-500">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="text-sm">Chargement…</span>
      <span className="sr-only" role="status">Chargement en cours</span>
    </div>
  );
}
