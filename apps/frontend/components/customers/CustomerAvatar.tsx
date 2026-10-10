import { cn } from '@/lib/utils';
import { getInitials } from './detail/constants';

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-primary/15 text-primary',
];

function avatarColor(name: string): string {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length] ?? 'bg-primary/15 text-primary';
}

/** Initiales du client sur une couleur stable tirée de son nom (liste, tableau, fiche). */
export function CustomerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn(
      'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
      avatarColor(name), className,
    )}>
      {getInitials(name)}
    </span>
  );
}
