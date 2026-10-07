import Link from 'next/link';
import { type ReactNode } from 'react';

interface CounterCardProps {
  label: string;
  value: string | number;
  valueColor?: string;
  sub?: ReactNode;
  subColor?: string;
  href?: string;
  icon?: ReactNode;
  iconVariant?: 'default' | 'amber' | 'red';
}

const ICON_VARIANTS: Record<NonNullable<CounterCardProps['iconVariant']>, string> = {
  default: 'bg-muted text-muted-foreground',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function CardInner({ label, value, valueColor, sub, subColor, icon, iconVariant }: Omit<CounterCardProps, 'href'>) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card px-5 py-4.5 gap-3.5 h-full">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${ICON_VARIANTS[iconVariant ?? 'default']}`}>
            {icon}
          </div>
        )}
      </div>
      <p className={`text-[2rem] font-bold leading-tight tabular-nums ${valueColor ?? 'text-foreground'}`}>{value}</p>
      {sub != null && (
        <p className={`text-[0.8125rem] ${subColor ?? 'text-muted-foreground'}`}>{sub}</p>
      )}
    </div>
  );
}

export function CounterCard({ href, ...props }: CounterCardProps) {
  if (href) {
    return (
      <Link href={href} className="active:scale-[0.98] transition-transform">
        <CardInner {...props} />
      </Link>
    );
  }
  return <CardInner {...props} />;
}
