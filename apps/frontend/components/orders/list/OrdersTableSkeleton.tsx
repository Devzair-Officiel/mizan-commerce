export function OrdersTableSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="h-10.5 border-b border-border bg-muted" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-border">
          <div className="h-3 w-12 rounded bg-muted animate-pulse" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-48 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
          <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
          <div className="h-3 w-14 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}
