import { type ReactNode } from 'react';

interface NoticeCardProps {
  icon: ReactNode;
  iconBg?: string;
  title: string;
  sub?: string;
  action?: ReactNode;
}

export function NoticeCard({
  icon,
  iconBg = 'bg-amber-100 dark:bg-amber-950/60',
  title,
  sub,
  action,
}: NoticeCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
