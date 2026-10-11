'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { EmailVerificationBanner } from '@/components/account/EmailVerificationBanner';
import {
  useMe,
  useUpdateMe,
  useChangePassword,
} from '@/lib/hooks/useMe';
import { ApiError } from '@/lib/api-client';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Skeleton } from '@/components/ui/skeleton';

type PasswordFieldProps = Omit<ComponentProps<typeof FloatingInput>, 'type'>;

type ProfileT = ReturnType<typeof useTranslations<'profile'>>;

function PasswordField({ label, ...props }: PasswordFieldProps) {
  const t = useTranslations('profile');
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <FloatingInput
        type={visible ? 'text' : 'password'}
        label={label}
        className="pe-12"
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('hide_password') : t('show_password')}
        aria-pressed={visible}
        className="absolute inset-e-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function makeProfileSchema(t: ProfileT) {
  return z.object({
    full_name: z.string().min(1, t('name_required')),
    phone: z.string().optional(),
  });
}

type ProfileValues = z.infer<ReturnType<typeof makeProfileSchema>>;

function makePasswordSchema(t: ProfileT) {
  return z.object({
    old_password: z.string().min(1, t('old_password_required')),
    new_password: z.string().min(8, t('password_min')),
    confirm: z.string().min(1, t('confirm_required')),
  }).refine((v) => v.new_password === v.confirm, {
    path: ['confirm'],
    message: t('password_mismatch'),
  });
}

type PasswordValues = z.infer<ReturnType<typeof makePasswordSchema>>;

function ProfileForm() {
  const t = useTranslations('profile');
  const { data: me, isLoading } = useMe();
  const { mutateAsync, isPending, isSuccess } = useUpdateMe();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileValues>({
    resolver: zodResolver(makeProfileSchema(t)),
  });

  useEffect(() => {
    if (me) {
      reset({ full_name: me.full_name ?? '', phone: me.phone ?? '' });
    }
  }, [me, reset]);

  async function onSubmit(values: ProfileValues) {
    await mutateAsync(values);
    reset(values);
  }

  if (isLoading) {
    return (
      <LoadingRegion className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        <Skeleton className="mt-1 h-8 rounded-lg" />
      </LoadingRegion>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <FloatingInput id="email" label={t('email')} value={me?.email ?? ''} disabled readOnly />
        <p className="text-[11px] text-muted-foreground px-1">{t('email_locked')}</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <FloatingInput id="full_name" label={t('full_name')} {...register('full_name')} />
        {errors.full_name && <p className="text-[11px] text-destructive px-1">{errors.full_name.message}</p>}
      </div>

      <FloatingInput id="phone" label={t('phone')} {...register('phone')} />

      {isSuccess && !isDirty && (
        <p className="text-sm text-green-700 dark:text-green-400 text-center">{t('profile_saved')}</p>
      )}

      <Button type="submit" disabled={isPending || !isDirty} className="w-full mt-1">
        {isPending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const t = useTranslations('profile');
  const { mutateAsync, isPending } = useChangePassword();

  const {
    register, handleSubmit, reset, setError,
    formState: { errors, isSubmitSuccessful },
  } = useForm<PasswordValues>({
    resolver: zodResolver(makePasswordSchema(t)),
  });

  async function onSubmit(values: PasswordValues) {
    try {
      await mutateAsync({
        old_password: values.old_password,
        new_password: values.new_password,
      });
      reset({ old_password: '', new_password: '', confirm: '' });
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, unknown>;
        if (typeof data.old_password === 'string') {
          setError('old_password', { message: data.old_password });
          return;
        }
        if (Array.isArray(data.new_password) && typeof data.new_password[0] === 'string') {
          setError('new_password', { message: data.new_password[0] });
          return;
        }
      }
      setError('root', { message: t('unexpected_error') });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <PasswordField id="old_password" label={t('old_password')} autoComplete="current-password" {...register('old_password')} />
        {errors.old_password && <p className="text-[11px] text-destructive px-1">{errors.old_password.message}</p>}
      </div>

      <div className="flex flex-col gap-0.5">
        <PasswordField id="new_password" label={t('new_password')} autoComplete="new-password" {...register('new_password')} />
        {errors.new_password && <p className="text-[11px] text-destructive px-1">{errors.new_password.message}</p>}
      </div>

      <div className="flex flex-col gap-0.5">
        <PasswordField id="confirm" label={t('confirm_password')} autoComplete="new-password" {...register('confirm')} />
        {errors.confirm && <p className="text-[11px] text-destructive px-1">{errors.confirm.message}</p>}
      </div>

      {errors.root && <p className="text-[11px] text-destructive px-1">{errors.root.message}</p>}

      {isSubmitSuccessful && !errors.root && (
        <p className="text-sm text-green-700 dark:text-green-400 text-center">{t('password_saved')}</p>
      )}

      <Button type="submit" disabled={isPending} className="w-full mt-1">
        {isPending ? t('changing_password') : t('change_password')}
      </Button>
    </form>
  );
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  return (
    <>
      <TopBar title={t('title')} />
      <div className="flex flex-col gap-8 px-4 pb-8 pt-4 max-w-3xl mx-auto w-full">
        <EmailVerificationBanner />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t('info_section')}</h2>
          <ProfileForm />
        </section>

        <div className="h-px bg-border" />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t('password_section')}</h2>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}
