'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { PhoneCountrySelect } from '@/components/form/PhoneCountrySelect';
import { EmailVerificationBanner } from '@/components/account/EmailVerificationBanner';
import { ProfileHeader } from '@/components/account/ProfileHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import {
  useMe,
  useUpdateMe,
  useChangePassword,
  type Me,
} from '@/lib/hooks/useMe';
import { ApiError } from '@/lib/api-client';
import { useShop } from '@/lib/hooks/useShop';
import { joinPhone, phoneCountry, splitPhone } from '@/lib/phone';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Skeleton } from '@/components/ui/skeleton';
import { resetKeepingEdits } from '@/components/form/resetKeepingEdits';

type PasswordFieldProps = Omit<ComponentProps<typeof FloatingInput>, 'type'>;

type ProfileT = ReturnType<typeof useTranslations<'profile'>>;

function PasswordField({ label, ...props }: PasswordFieldProps) {
  const t = useTranslations('profile');
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative [&_label]:inset-e-14 [&_label]:truncate">
      <FloatingInput
        type={visible ? 'text' : 'password'}
        label={label}
        className="pe-14"
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('hide_password') : t('show_password')}
        aria-pressed={visible}
        className="absolute inset-e-1 top-1/2 -translate-y-1/2 flex size-12 items-center justify-center whitespace-nowrap rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 lg:size-11"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

function makeProfileSchema(t: ProfileT) {
  return z.object({
    full_name: z.string().min(1, t('name_required')),
    phone: z.string(),
    /** Indicatif choisi (code ISO) ; vide : celui du pays de la boutique. */
    phone_country: z.string(),
  });
}

type ProfileValues = z.infer<ReturnType<typeof makeProfileSchema>>;

function profileValues(me: Pick<Me, 'full_name' | 'phone'>): ProfileValues {
  const stored = splitPhone(me.phone ?? '');
  return { full_name: me.full_name ?? '', phone: stored.national, phone_country: stored.country ?? '' };
}

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
  const { data: shop } = useShop();

  const form = useForm<ProfileValues>({ resolver: zodResolver(makeProfileSchema(t)) });
  const { register, control, handleSubmit, setError, formState: { errors, isDirty } } = form;

  // Données rechargées (après un enregistrement notamment) : la saisie en cours est gardée.
  useEffect(() => {
    if (me) resetKeepingEdits(form, profileValues(me));
  }, [me, form]);

  async function onSubmit(values: ProfileValues) {
    const { full_name, phone, phone_country } = values;
    try {
      const saved = await mutateAsync({ full_name, phone: joinPhone(phoneCountry(phone_country || shop?.country), phone) });
      resetKeepingEdits(form, profileValues(saved), values);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError('phone', { message: t('phone_invalid') });
      else setError('root', { message: t('unexpected_error') });
    }
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" data-profile-form>
      <div className="flex flex-col gap-0.5">
        <FloatingInput id="email" label={t('email')} value={me?.email ?? ''} disabled readOnly dir="ltr" aria-describedby="profile-email-help" />
        <p id="profile-email-help" className="text-xs text-muted-foreground px-1">{t('email_locked')}</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <FloatingInput id="full_name" label={t('full_name')} dir="auto" aria-required aria-invalid={!!errors.full_name} aria-describedby={errors.full_name ? 'profile-name-error' : undefined} {...register('full_name')} />
        {errors.full_name && <p id="profile-name-error" className="text-xs text-destructive px-1">{errors.full_name.message}</p>}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex gap-2 rtl:flex-row-reverse">
          <Controller control={control} name="phone_country" render={({ field }) => (
            <PhoneCountrySelect value={phoneCountry(field.value || shop?.country)} onChange={field.onChange} floating />
          )} />
          <div className="min-w-0 flex-1">
            <FloatingInput id="phone" label={t('phone')} type="tel" inputMode="tel" dir="ltr" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'profile-phone-error' : undefined} {...register('phone')} />
          </div>
        </div>
        {errors.phone && <p id="profile-phone-error" className="text-xs text-destructive px-1">{errors.phone.message}</p>}
      </div>
      {errors.root && <p className="text-[11px] text-destructive px-1">{errors.root.message}</p>}

      {isSuccess && !isDirty && (
        <p className="text-sm text-green-700 dark:text-green-400 text-center">{t('profile_saved')}</p>
      )}

      <Button type="submit" disabled={isPending || !isDirty} className="mt-1 h-12 w-full rounded-full active:scale-[0.98] lg:h-11">
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" data-password-form>
      <div className="flex flex-col gap-0.5">
        <PasswordField id="old_password" label={t('old_password')} autoComplete="current-password" aria-required aria-invalid={!!errors.old_password} aria-describedby={errors.old_password ? 'profile-old-password-error' : undefined} {...register('old_password')} />
        {errors.old_password && <p id="profile-old-password-error" className="text-xs text-destructive px-1">{errors.old_password.message}</p>}
      </div>

      <div className="flex flex-col gap-0.5">
        <PasswordField id="new_password" label={t('new_password')} autoComplete="new-password" aria-required aria-invalid={!!errors.new_password} aria-describedby={errors.new_password ? 'profile-new-password-error' : undefined} {...register('new_password')} />
        {errors.new_password && <p id="profile-new-password-error" className="text-xs text-destructive px-1">{errors.new_password.message}</p>}
      </div>

      <div className="flex flex-col gap-0.5">
        <PasswordField id="confirm" label={t('confirm_password')} autoComplete="new-password" aria-required aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? 'profile-confirm-error' : undefined} {...register('confirm')} />
        {errors.confirm && <p id="profile-confirm-error" className="text-xs text-destructive px-1">{errors.confirm.message}</p>}
      </div>

      {errors.root && <p className="text-[11px] text-destructive px-1">{errors.root.message}</p>}

      {isSubmitSuccessful && !errors.root && (
        <p className="text-sm text-green-700 dark:text-green-400 text-center">{t('password_saved')}</p>
      )}

      <Button type="submit" disabled={isPending} className="mt-1 h-12 w-full rounded-full active:scale-[0.98] lg:h-11">
        {isPending ? t('changing_password') : t('change_password')}
      </Button>
    </form>
  );
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  return (
    <div className="mx-auto w-full max-w-220" data-profile-page>
      <TopBar hideSearch title={t('title')} subtitle={t('subtitle')} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-28 lg:gap-5 lg:pt-0">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <ProfileHeader />
          <EmailVerificationBanner />
        </section>
        <div data-profile-cards className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5">
          <SectionCard title={t('info_section')}>
            <div className="flex flex-col gap-4 p-5">
              <p className="text-xs text-muted-foreground">{t('info_description')}</p>
              <ProfileForm />
            </div>
          </SectionCard>
          <SectionCard title={t('password_section')}>
            <div className="flex flex-col gap-4 p-5">
              <p className="text-xs text-muted-foreground">{t('password_description')}</p>
              <PasswordForm />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
