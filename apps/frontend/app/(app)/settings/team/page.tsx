'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserPlus, Users } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useMe } from '@/lib/hooks/useMe';
import { useLimitGuard } from '@/lib/hooks/usePlanUsage';
import {
  useShopMembers,
  useDeleteShopMember,
  type ShopMember,
} from '@/lib/hooks/useShopMembers';
import { ApiError } from '@/lib/api-client';
import { MemberFormSheet, type FormMode } from '@/components/team/MemberFormSheet';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import { TeamMembersHeader, TeamAvailablePlaces } from '@/components/team/TeamMembersHeader';
import { MemberIdentity, MemberAccess, RoleBadge, MemberActions } from '@/components/team/MemberDetails';

export default function TeamPage() {
  const t = useTranslations('team');
  return (
    <FeatureGate feature="multi_user" title={t('title')} belowCard={<ReadOnlyMembers />}>
      <TeamContent />
    </FeatureGate>
  );
}

function TeamContent() {
  const t = useTranslations('team');
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const memberGuard = useLimitGuard('members');

  return (
    <>
      <TopBar hideSearch back backLabel={t('back')} title={t('title')} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-32">
        <section className="lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-card">
          <TeamMembersHeader action={
            <Button type="button" aria-label={t('add_member')} className="h-11 rounded-full px-3 lg:px-5 active:scale-[0.98]"
              onClick={(event) => {
                memberGuard.onClick(event);
                if (!event.defaultPrevented) setFormMode({ kind: 'create' });
              }}>
              <UserPlus className="size-4" aria-hidden />
              <span className="hidden lg:inline">{t('add_member')}</span>
            </Button>
          } />
          <MemberList onEdit={(member) => setFormMode({ kind: 'edit', member })} />
          <TeamAvailablePlaces />
        </section>
      </div>

      {formMode && (
        <MemberFormSheet
          open
          onClose={() => setFormMode(null)}
          mode={formMode}
        />
      )}
      <UpgradeSheet {...memberGuard.sheet} />
    </>
  );
}

/** Hors Boutique : les membres restent visibles et peuvent être retirés, pas modifiés. */
function ReadOnlyMembers() {
  const t = useTranslations('team');
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{t('readonly_title')}</h2>
        <p className="text-sm text-muted-foreground">{t('readonly_note')}</p>
      </div>
      <MemberList />
    </section>
  );
}

/* ─────────────── Member list ─────────────── */

/** Sans `onEdit`, la liste est en lecture seule : seul le retrait reste proposé. */
function MemberList({ onEdit }: { onEdit?: (member: ShopMember) => void }) {
  const t = useTranslations('team');
  const { data: me } = useMe();
  const { data: members, isLoading, isError, refetch } = useShopMembers();
  const [deleteTarget, setDeleteTarget] = useState<ShopMember | null>(null);

  if (isLoading) return <SkeletonRows count={3} variant="cards" rowClassName="p-4" />;
  if (isError) return (
    <div role="alert" className="flex flex-col items-start gap-3 p-5 text-sm">
      <p>{t('load_error')}</p>
      <Button type="button" variant="outline" onClick={() => refetch()}>{t('retry')}</Button>
    </div>
  );
  if (!members?.length) return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted"><Users className="size-5 text-muted-foreground" aria-hidden /></span>
      <h3 className="text-sm font-semibold">{t('empty_title')}</h3>
      <p className="text-sm text-muted-foreground">{t('no_members')}</p>
    </div>
  );
  const details = (member: ShopMember) => ({
    member,
    isSelf: member.user === me?.id,
    onEdit: onEdit ? () => onEdit(member) : undefined,
    onDelete: () => setDeleteTarget(member),
  });
  return (
    <>
      <table data-member-table className="hidden w-full table-fixed border-collapse text-start lg:table">
        <caption className="sr-only">{t('members_title')}</caption>
        <thead className="header-band">
          <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
            <th scope="col" className="w-[32%] px-3 py-3 text-start">{t('columns.member')}</th>
            <th scope="col" className="w-[20%] px-3 py-3 text-start">{t('columns.role')}</th>
            <th scope="col" className="w-[28%] px-3 py-3 text-start">{t('columns.access')}</th>
            <th scope="col" className="w-[20%] px-3 py-3 text-end">{t('columns.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {members.map((member) => (
            <tr key={member.id} data-member-row>
              <td className="px-3 py-4 align-top"><MemberIdentity {...details(member)} /></td>
              <td className="px-3 py-4 align-top"><RoleBadge role={member.role} /></td>
              <td className="px-3 py-4 align-top"><MemberAccess member={member} /></td>
              <td className="px-3 py-4 align-top"><MemberActions {...details(member)} compact /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul data-member-cards className="mt-4 flex flex-col gap-3 lg:hidden">
        {members.map((member) => (
          <li key={member.id}>
            <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" data-member-card>
              <MemberIdentity {...details(member)} />
              <div><RoleBadge role={member.role} /></div>
              <MemberAccess member={member} />
              <MemberActions {...details(member)} />
            </article>
          </li>
        ))}
      </ul>
      <DeleteSheet target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </>
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
