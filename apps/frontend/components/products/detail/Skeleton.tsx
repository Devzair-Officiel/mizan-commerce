export function ProductDetailSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-4" aria-hidden>
      <div className="rounded-3xl p-5 flex flex-col items-center gap-3 bg-muted/30">
        <div className="h-20 w-20 rounded-full bg-muted animate-pulse" />
        <div className="h-5 w-40 rounded bg-muted animate-pulse" />
        <div className="h-4 w-16 rounded-full bg-muted animate-pulse" />
        <div className="h-12 w-full rounded-full bg-muted animate-pulse mt-2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
      </div>
      <div className="h-40 rounded-2xl bg-muted animate-pulse" />
    </div>
  );
}
