'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError } from '@/lib/api-client';

type LoginForm = { email: string; password: string };

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tc = useTranslations('auth.common');
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(tc('invalid_email')),
        password: z.string().min(1, t('password_required')),
      }),
    [t, tc],
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  async function onSubmit(data: LoginForm) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new ApiError(res.status, null, '');
      router.replace('/dashboard');
    } catch {
      setError('root', { message: t('error_credentials') });
    }
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
          <label htmlFor="email">{tc('email')}</label>
          <input
            id="email"
            type="email"
            className="au-input"
            placeholder="vous@exemple.com"
            autoComplete="email"
            inputMode="email"
            {...register('email')}
          />
          {errors.email && <p className="au-error">{errors.email.message}</p>}
        </div>

        <div className="au-field">
          <label htmlFor="password">{tc('password')}</label>
          <div className="au-pwd">
            <input
              id="password"
              type={showPwd ? 'text' : 'password'}
              className="au-input"
              autoComplete="current-password"
              {...register('password')}
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
          {errors.password && <p className="au-error">{errors.password.message}</p>}
        </div>

        {errors.root && <p className="au-root-error">{errors.root.message}</p>}

        <button type="submit" className="au-cta" disabled={isSubmitting}>
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>

      <p className="au-foot">
        {t('no_account')}{' '}
        <Link href="/register">{t('signup_link')}</Link>
      </p>
      <p className="au-foot au-foot-secondary">
        <Link href="/forgot-password">{t('forgot_password_link')}</Link>
      </p>
    </div>
  );
}
