'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { TOGGLEABLE_MODULES, type ModuleKey } from '@/lib/hooks/useMe';
import {
  useCreateShopMember,
  useUpdateShopMember,
  type ShopMember,
} from '@/lib/hooks/useShopMembers';
import { ApiError } from '@/lib/api-client';

export type FormMode =
  | { kind: 'create' }
  | { kind: 'edit'; member: ShopMember };

interface MemberFormSheetProps {
  open: boolean;
  onClose: () => void;
  mode: FormMode;
}

const createSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8),
});

type CreateValues = z.infer<typeof createSchema>;

export function MemberFormSheet(props: MemberFormSheetProps) {
  const t = useTranslations('team');
  const title =
    props.mode.kind === 'create'
      ? t('form.create_title')
      : t('form.edit_for', { name: props.mode.member.user_full_name });

  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={title}>
      {props.open &&
        (props.mode.kind === 'create' ? (
          <CreateForm onClose={props.onClose} />
        ) : (
          <EditForm member={props.mode.member} onClose={props.onClose} />
        ))}
    </BottomSheet>
  );
}

/* ─────────────── Create ─────────────── */

function CreateForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations('team');
  const { mutateAsync, isPending } = useCreateShopMember();
  const [perms, setPerms] = useState<ModuleKey[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: '', full_name: '', phone: '', password: '' },
  });

  async function onSubmit(values: CreateValues) {
    setServerError(null);
    try {
      await mutateAsync({
        email: values.email,
        full_name: values.full_name,
        phone: values.phone ?? '',
        password: values.password,
        permissions: perms,
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? extractError(err.data) ?? t('errors.create_error')
          : t('errors.create_error');
      setServerError(message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FloatingInput
        id="member-email"
        label={t('form.email')}
        type="email"
        autoComplete="off"
        required
        {...register('email')}
      />
      {errors.email && (
        <p className="text-[11px] text-destructive -mt-3 px-1">
          {t('form.email_required')}
        </p>
      )}

      <FloatingInput
        id="member-name"
        label={t('form.full_name')}
        required
        {...register('full_name')}
      />
      {errors.full_name && (
        <p className="text-[11px] text-destructive -mt-3 px-1">
          {t('form.name_required')}
        </p>
      )}

      <FloatingInput
        id="member-phone"
        label={t('form.phone')}
        autoComplete="off"
        {...register('phone')}
      />

      <div className="relative">
        <FloatingInput
          id="member-password"
          label={t('form.password')}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          className="pe-12"
          {...register('password')}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute inset-e-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {errors.password && (
        <p className="text-[11px] text-destructive -mt-3 px-1">
          {t('form.password_min')}
        </p>
      )}

      <PermissionsPicker value={perms} onChange={setPerms} />

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      <SheetFooter
        onCancel={onClose}
        submitting={isPending}
        submitLabel={t('form.submit_create')}
      />
    </form>
  );
}

/* ─────────────── Edit ─────────────── */

const ROLE_OPTIONS = ['admin', 'staff'] as const;
type EditableRole = (typeof ROLE_OPTIONS)[number];

function EditForm({ member, onClose }: { member: ShopMember; onClose: () => void }) {
  const t = useTranslations('team');
  const { mutateAsync, isPending } = useUpdateShopMember(member.id);
  const initialRole: EditableRole = member.role === 'owner' ? 'admin' : member.role;
  const isOwner = member.role === 'owner';

  const [role, setRole] = useState<EditableRole>(initialRole);
  const [perms, setPerms] = useState<ModuleKey[]>(member.permissions);
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit() {
    setServerError(null);
    try {
      // Owner: aucune modif possible côté serveur — on évite l'appel.
      if (isOwner) {
        onClose();
        return;
      }
      await mutateAsync({
        role,
        permissions: role === 'staff' ? perms : [],
      });
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? extractError(err.data) ?? t('errors.update_error')
          : t('errors.update_error');
      setServerError(message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-foreground mb-1">
          {t('form.role_label')}
        </legend>
        <div className="flex gap-2">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={isOwner}
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                role === r
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              } disabled:opacity-60`}
            >
              {t(`role.${r}`)}
            </button>
          ))}
        </div>
        {isOwner && (
          <p className="text-[11px] text-muted-foreground px-1">
            {t('role.owner')}
          </p>
        )}
      </fieldset>

      {role === 'staff' ? (
        <PermissionsPicker value={perms} onChange={setPerms} />
      ) : (
        <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {t('form.admin_full_access_notice')}
        </div>
      )}

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      <SheetFooter
        onCancel={onClose}
        submitting={isPending}
        submitLabel={t('form.submit_update')}
        onSubmit={onSubmit}
        disabled={isOwner}
      />
    </div>
  );
}

/* ─────────────── Permissions picker ─────────────── */

interface PermissionsPickerProps {
  value: ModuleKey[];
  onChange: (next: ModuleKey[]) => void;
}

function PermissionsPicker({ value, onChange }: PermissionsPickerProps) {
  const t = useTranslations('team');
  const selected = useMemo(() => new Set(value), [value]);

  function toggle(module: ModuleKey) {
    const next = new Set(selected);
    if (next.has(module)) next.delete(module);
    else next.add(module);
    onChange(Array.from(next));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-foreground">
        {t('form.permissions_title')}
      </legend>
      <p className="text-[11px] text-muted-foreground -mt-1">
        {t('form.permissions_help')}
      </p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {TOGGLEABLE_MODULES.map((m) => {
          const active = selected.has(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggle(m)}
              aria-pressed={active}
              className={`rounded-xl border px-3 py-2.5 text-start text-sm font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-muted'
              }`}
            >
              {t(`modules.${m}`)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ─────────────── Footer ─────────────── */

interface SheetFooterProps {
  onCancel: () => void;
  onSubmit?: () => void;
  submitting: boolean;
  submitLabel: string;
  disabled?: boolean;
}

function SheetFooter({
  onCancel,
  onSubmit,
  submitting,
  submitLabel,
  disabled,
}: SheetFooterProps) {
  const t = useTranslations('team');
  return (
    <div className="flex gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
        {t('form.cancel')}
      </Button>
      <Button
        type={onSubmit ? 'button' : 'submit'}
        onClick={onSubmit}
        disabled={submitting || disabled}
        className="flex-1"
      >
        {submitting ? t('form.submitting') : submitLabel}
      </Button>
    </div>
  );
}

/* ─────────────── Helpers ─────────────── */

function extractError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.detail === 'string') return obj.detail;
  // DRF renvoie souvent { field: ['message'] }
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return null;
}

