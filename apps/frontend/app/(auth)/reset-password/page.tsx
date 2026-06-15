'use client';

import { Suspense, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Eye, EyeOff, ShieldAlert } from 'lucide-react';

type FormData = { new_password: string; confirm_password: string };

function ResetPasswordForm() {
  const t = useTranslations('auth.resetPassword');
  const tc = useTranslations('auth.common');
  const params = useSearchParams();
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          new_password: z.string().min(8, t('password_min')),
          confirm_password: z.string(),
        })
        .refine((d) => d.new_password === d.confirm_password, {
          message: t('mismatch'),
          path: ['confirm_password'],
        }),
    [t],
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, token, new_password: data.new_password }),
    });

    if (!res.ok) {
      setError('root', { message: tc('invalid_or_expired_link') });
      return;
    }

    setDone(true);
  }

  if (!uid || !token) {
    return (
      <div className="au-card au-confirm">
        <div className="au-confirm-icon is-error" aria-hidden>
          <ShieldAlert size={28} strokeWidth={2.25} />
        </div>
        <h1 className="au-confirm-title">{t('invalid_link_title')}</h1>
        <p>{t('invalid_link')}</p>
        <div className="au-confirm-actions">
          <Link href="/forgot-password" className="au-cta">
            {t('signin_cta')}
          </Link>
          <Link href="/login" className="au-cta-ghost">
            {tc('back_to_login')}
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="au-card au-confirm">
        <div className="au-confirm-icon" aria-hidden>
          <Check size={28} strokeWidth={2.5} />
        </div>
        <h1 className="au-confirm-title">{t('done_title')}</h1>
        <p>{t('done')}</p>
        <div className="au-confirm-actions">
          <Link href="/login" className="au-cta">
            {t('signin_cta')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="au-card">
      <h1>
        {t('headline_lead')}{' '}
        <span className="serif-i">{t('headline_accent')}</span>
      </h1>
      <p className="au-sub">{t('subtitle')}</p>
      <div className="au-divider" />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="au-field">
          <label htmlFor="new_password">{t('new_password')}</label>
          <div className="au-pwd">
            <input
              id="new_password"
              type={showPwd ? 'text' : 'password'}
              className="au-input"
              autoComplete="new-password"
              {...register('new_password')}
            />
            <button
              type="button"
              className="au-pwd-toggle"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showPwd}
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.new_password && (
            <p className="au-error">{errors.new_password.message}</p>
          )}
        </div>

        <div className="au-field">
          <label htmlFor="confirm_password">{t('confirm_password')}</label>
          <div className="au-pwd">
            <input
              id="confirm_password"
              type={showConfirm ? 'text' : 'password'}
              className="au-input"
              autoComplete="new-password"
              {...register('confirm_password')}
            />
            <button
              type="button"
              className="au-pwd-toggle"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showConfirm}
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.confirm_password && (
            <p className="au-error">{errors.confirm_password.message}</p>
          )}
        </div>

        {errors.root && <p className="au-root-error">{errors.root.message}</p>}

        <button type="submit" className="au-cta" disabled={isSubmitting}>
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>

      <p className="au-foot">
        <Link href="/login">{tc('back_to_login')}</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
