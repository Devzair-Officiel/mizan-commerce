interface PartyCardProps {
  title: string;
  name: string;
  address: string;
  extras: (string | undefined)[];
}

export function PartyCard({ title, name, address, extras }: PartyCardProps) {
  const visibleExtras = extras.filter(Boolean) as string[];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
      <p className="text-sm font-semibold text-foreground">{name}</p>
      {address && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{address}</p>
      )}
      {visibleExtras.map((extra) => (
        <p key={extra} className="text-xs text-muted-foreground">
          {extra}
        </p>
      ))}
    </div>
  );
}
