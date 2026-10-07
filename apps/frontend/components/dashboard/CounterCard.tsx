import Link from 'next/link';
import { type ReactNode } from 'react';

interface CounterCardProps {
  label: string;
  value: string | number;
  sub?: string;
  subColor?: string;
  href?: string;
  icon?: ReactNode;
}

function CardInner({ label, value, sub, subColor, icon }: Omit<CounterCardProps, 'href'>) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 h-full">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        {icon}
        {label}
      </p>
      <p className="text-3xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && (
        <p className={`text-xs font-medium ${subColor ?? 'text-muted-foreground'}`}>{sub}</p>
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
