'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu } from '@base-ui/react/menu';
import { MoreHorizontal } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { cn } from '@/lib/utils';
import type { DetailAction, DetailMenuActions } from './types';

interface DetailActionsMenuProps {
  actions: DetailMenuActions;
  /** menu : menu ancré (desktop). sheet : feuille du bas (mobile). Même liste d'actions. */
  variant: 'menu' | 'sheet';
}

const ROW = 'flex w-full items-center gap-2.5 whitespace-nowrap text-start font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';

function ActionContent({ action }: { action: DetailAction }) {
  const Icon = action.icon;
  return (
    <>
      <Icon size={18} className={action.destructive ? 'text-destructive' : 'text-muted-foreground'} aria-hidden />
      {action.label}
    </>
  );
}

function MenuEntry({ action }: { action: DetailAction }) {
  const cls = cn(ROW, 'h-10 cursor-pointer rounded-lg px-3 text-sm outline-none data-highlighted:bg-muted data-disabled:opacity-50',
    action.destructive ? 'text-destructive' : 'text-foreground');
  if (action.href) {
    return <Menu.LinkItem href={action.href} target="_blank" rel="noopener" className={cls}><ActionContent action={action} /></Menu.LinkItem>;
  }
  return <Menu.Item onClick={action.onSelect} disabled={action.disabled} className={cls}><ActionContent action={action} /></Menu.Item>;
}

function SheetEntry({ action, onDone }: { action: DetailAction; onDone: () => void }) {
  const cls = cn(ROW, 'h-12 gap-3 rounded-xl px-3 text-[0.9375rem] active:bg-muted', action.destructive ? 'text-destructive' : 'text-foreground');
  if (action.href) {
    return <a href={action.href} target="_blank" rel="noopener" onClick={onDone} className={cls}><ActionContent action={action} /></a>;
  }
  return (
    <button type="button" disabled={action.disabled} className={cls} onClick={() => { onDone(); action.onSelect?.(); }}>
      <ActionContent action={action} />
    </button>
  );
}

const TRIGGER = 'grid size-11 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Bouton « ⋯ » : actions secondaires de la page, puis l'action dangereuse après un séparateur. */
export function DetailActionsMenu({ actions, variant }: DetailActionsMenuProps) {
  const t = useTranslations('ui.detail');
  const [open, setOpen] = useState(false);
  const { items, danger } = actions;
  if (items.length === 0 && !danger) return null;

  if (variant === 'sheet') {
    const close = () => setOpen(false);
    return (
      <>
        <button type="button" aria-label={t('more_actions')} aria-haspopup="dialog" onClick={() => setOpen(true)} className={TRIGGER}>
          <MoreHorizontal size={22} aria-hidden />
        </button>
        <BottomSheet open={open} onClose={close} title={t('actions_title')}>
          <div className="flex flex-col px-2 pb-4">
            {items.map((a) => <SheetEntry key={a.key} action={a} onDone={close} />)}
            {danger && items.length > 0 && <div role="separator" className="mx-3 my-1.5 h-px bg-border" />}
            {danger && <SheetEntry action={danger} onDone={close} />}
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger aria-label={t('more_actions')} className={cn(TRIGGER, 'border border-border bg-card data-popup-open:bg-muted')}>
        <MoreHorizontal size={20} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Menu.Popup aria-label={t('actions_title')} className="w-65 rounded-2xl border border-border bg-card p-1.5 shadow-lg outline-none">
            {items.map((a) => <MenuEntry key={a.key} action={a} />)}
            {danger && items.length > 0 && <Menu.Separator className="my-1 h-px bg-border" />}
            {danger && <MenuEntry action={danger} />}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
