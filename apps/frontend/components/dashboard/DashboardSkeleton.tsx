export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="h-3 w-20 bg-muted animate-pulse rounded-md" />
            <div className="h-8 w-16 bg-muted animate-pulse rounded-md" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="h-4 w-28 bg-muted animate-pulse rounded-md" />
              {[0, 1].map((j) => (
                <div key={j} className="h-12 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="h-4 w-24 bg-muted animate-pulse rounded-md mb-3" />
            <div className="flex items-end gap-1 h-24">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex-1 bg-muted animate-pulse rounded-sm" style={{ height: `${30 + i * 8}%` }} />
              ))}
            </div>
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="h-4 w-24 bg-muted animate-pulse rounded-md" />
              {[0, 1].map((j) => (
                <div key={j} className="h-10 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
