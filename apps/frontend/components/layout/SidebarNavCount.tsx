/** Pastille numérique de la sidebar : rouge pour le stock bas, neutre sinon ; plus petite et posée sur l'icône en rail. */
export function SidebarNavCount({ count, alert = false, rail = false }: { count: number; alert?: boolean; rail?: boolean }) {
  if (count <= 0) return null;
  const tone = alert ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground';
  const shape = rail
    ? 'absolute -top-1 -inset-e-1 min-w-4.5 h-4.5 px-1 text-[0.625rem] ring-2 ring-sidebar'
    : 'ms-auto min-w-5.5 h-5.5 px-1.5 text-xs';
  return (
    <span aria-hidden="true" className={`${shape} ${tone} shrink-0 rounded-full font-semibold tabular-nums flex items-center justify-center leading-none`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
