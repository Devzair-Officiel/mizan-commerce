interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: 'red' | 'amber';
  active: boolean;
  onClick: () => void;
}

export function StatCard({ label, value, icon, tone, active, onClick }: StatCardProps) {
  const iconWrap =
    tone === 'red'
      ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300'
      : 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300';
  const valueTone = active
    ? tone === 'red'
      ? 'text-red-600 dark:text-red-400'
      : 'text-amber-600 dark:text-amber-400'
    : 'text-foreground';

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-4 flex flex-col gap-2 text-left transition-colors active:scale-[0.98] ${
        active ? 'border-primary bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${iconWrap}`}>
          {icon}
        </div>
      </div>
      <p className={`text-3xl font-bold tabular-nums ${valueTone}`}>{value}</p>
    </button>
  );
}
