'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserPlus, Pencil, Trash2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useMe } from '@/lib/hooks/useMe';
import {
  useShopMembers,
  useDeleteShopMember,
  type ShopMember,
} from '@/lib/hooks/useShopMembers';
import { ApiError } from '@/lib/api-client';
import { MemberFormSheet, type FormMode } from '@/components/team/MemberFormSheet';

export default function TeamPage() {
  const t = useTranslations('team');
  const { data: me } = useMe();
  const { data: members, isLoading } = useShopMembers();

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShopMember | null>(null);

  return (
    <>
      <TopBar title={t('title')} />

      <div className="px-4 pt-4 pb-32 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>

        <Button
          type="button"
          onClick={() => setFormMode({ kind: 'create' })}
          className="self-start"
        >
          <UserPlus className="h-4 w-4" />
          {t('add_member')}
        </Button>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : members && members.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {members.map((member) => (
              <li key={member.id}>
                <MemberCard
                  member={member}
                  isSelf={member.user === me?.id}
                  onEdit={() => setFormMode({ kind: 'edit', member })}
                  onDelete={() => setDeleteTarget(member)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('no_members')}</p>
        )}
      </div>

      {formMode && (
        <MemberFormSheet
          open
          onClose={() => setFormMode(null)}
          mode={formMode}
        />
      )}

      <DeleteSheet
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

/* ─────────────── Member card ─────────────── */

interface MemberCardProps {
  member: ShopMember;
  isSelf: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function MemberCard({ member, isSelf, onEdit, onDelete }: MemberCardProps) {
  const t = useTranslations('team');
  const isOwner = member.role === 'owner';
  const isStaff = member.role === 'staff';

  return (
    <article className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {member.user_full_name}
            </h2>
            {isSelf && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('you_badge')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{member.user_email}</p>
          {member.user_phone && (
            <p className="text-xs text-muted-foreground truncate">{member.user_phone}</p>
          )}
        </div>
        <RoleBadge role={member.role} />
      </div>

      {isStaff ? (
        member.permissions.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {member.permissions.map((p) => (
              <li
                key={p}
                className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium"
              >
                {t(`modules.${p}`)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">
            {t('no_permissions')}
          </p>
        )
      ) : (
        <p className="text-[11px] text-muted-foreground italic">
          {t('admin_full_access')}
        </p>
      )}

      {!isSelf && !isOwner && (
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="flex-1"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('actions.edit')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onDelete}
            className="flex-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('actions.delete')}
          </Button>
        </div>
      )}
    </article>
  );
}

function RoleBadge({ role }: { role: ShopMember['role'] }) {
  const t = useTranslations('team');
  const style =
    role === 'owner'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : role === 'admin'
        ? 'bg-primary/15 text-primary'
        : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {t(`role.${role}`)}
    </span>
  );
}

/* ─────────────── Delete sheet ─────────────── */

interface DeleteSheetProps {
  target: ShopMember | null;
  onClose: () => void;
}

function DeleteSheet({ target, onClose }: DeleteSheetProps) {
  const t = useTranslations('team');
  const { mutateAsync, isPending } = useDeleteShopMember();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!target) return;
    setError(null);
    try {
      await mutateAsync(target.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? extractError(err.data) ?? t('errors.delete_error')
          : t('errors.delete_error'),
      );
    }
  }

  function handleClose() {
    setError(null);
    onClose();
  }

  return (
    <BottomSheet
      open={!!target}
      onClose={handleClose}
      title={t('actions.confirm_delete_title')}
    >
      {target && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t('actions.confirm_delete_body', { name: target.user_full_name })}
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirm}
              disabled={isPending}
              className="flex-1"
            >
              {isPending ? t('form.submitting') : t('actions.confirm_delete')}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.detail === 'string') return obj.detail;
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return null;
}
