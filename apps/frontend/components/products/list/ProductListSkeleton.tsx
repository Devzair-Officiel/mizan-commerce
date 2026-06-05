export function ProductListSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-3 py-3 ${i === 0 ? '' : 'border-t border-border'}`}
        >
          <div className="h-11 w-11 shrink-0 rounded-xl bg-muted animate-pulse" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-3.5 w-14 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}
