type ActionRowTone = 'default' | 'success' | 'danger';

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  tone?: ActionRowTone;
}

export function ActionRow({
  icon,
  label,
  description,
  onClick,
  disabled,
  tone = 'default',
}: ActionRowProps) {
  const iconClasses =
    tone === 'danger'
      ? 'bg-red-500/10 text-red-500 dark:bg-red-500/15 dark:text-red-400'
      : tone === 'success'
        ? 'bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400'
        : 'bg-primary/10 text-primary';
  const labelClasses =
    tone === 'danger'
      ? 'text-red-500 dark:text-red-400'
      : tone === 'success'
        ? 'text-green-600 dark:text-green-400'
        : 'text-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:bg-muted disabled:opacity-60"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClasses}`}>
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`text-sm font-medium ${labelClasses}`}>{label}</span>
        {description && (
          <span className="truncate text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </button>
  );
}
