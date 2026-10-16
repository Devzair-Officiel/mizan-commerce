'use client';

import { useTranslations } from 'next-intl';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { ShopMember } from '@/lib/hooks/useShopMembers';

export function MemberIdentity({ member, isSelf }: { member: ShopMember; isSelf: boolean }) {
  const t = useTranslations('team');
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span dir="auto" className="min-w-0 wrap-anywhere text-sm font-semibold">{member.user_full_name}</span>
        {isSelf && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t('you_badge')}</span>}
      </div>
      <span dir="ltr" className="wrap-anywhere text-start text-xs text-muted-foreground">{member.user_email}</span>
      {member.user_phone && <span dir="ltr" className="wrap-anywhere text-start text-xs text-muted-foreground">{member.user_phone}</span>}
    </div>
  );
}

export function MemberAccess({ member }: { member: ShopMember }) {
  const t = useTranslations('team');
  const kind = useCatalogKind();
  if (member.role !== 'staff') return <p className="text-xs text-muted-foreground">{t('admin_full_access')}</p>;
  if (!member.permissions.length) return <p className="text-xs text-muted-foreground">{t('no_permissions')}</p>;
  const names = member.permissions.slice(0, 3).map((key) => key === 'products' ? t('modules.products', { kind }) : t(`modules.${key}`));
  const remaining = member.permissions.length - names.length;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium tabular-nums">{t('modules_count', { count: member.permissions.length })}</p>
      <p className="wrap-anywhere text-xs text-muted-foreground">
        {names.join(', ')}{remaining > 0 && <> <bdi className="tabular-nums">+{remaining}</bdi></>}
      </p>
    </div>
  );
}

export function RoleBadge({ role }: { role: ShopMember['role'] }) {
  const t = useTranslations('team');
  const style = role === 'owner' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    : role === 'admin' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground';
  return <span className={`inline-block max-w-full wrap-anywhere rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{t(`role.${role}`)}</span>;
}

export function MemberActions({ member, isSelf, onEdit, onDelete, compact = false }: {
  member: ShopMember; isSelf: boolean; onEdit?: () => void; onDelete: () => void; compact?: boolean;
}) {
  const t = useTranslations('team');
  if (isSelf || member.role === 'owner') return null;
  const buttonClass = compact ? 'size-11 shrink-0 rounded-full p-0 active:scale-95' : 'h-11 min-w-0 flex-1 rounded-full px-3 active:scale-[0.98]';
  return (
    <div className={`flex gap-3 ${compact ? 'flex-wrap justify-end' : ''}`}>
      {onEdit && <Button type="button" variant="outline" onClick={onEdit} className={buttonClass}
        aria-label={compact ? t('edit_member', { name: member.user_full_name }) : undefined}>
        <Pencil className="size-4" aria-hidden />{!compact && t('actions.edit')}
      </Button>}
      <Button type="button" variant="destructive" onClick={onDelete} className={buttonClass}
        aria-label={compact ? t('remove_member', { name: member.user_full_name }) : undefined}>
        <Trash2 className="size-4" aria-hidden />{!compact && t('actions.delete')}
      </Button>
    </div>
  );
}
