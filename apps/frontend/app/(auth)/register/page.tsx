'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import {
  GoogleReCaptchaProvider,
  useGoogleReCaptcha,
} from 'react-google-recaptcha-v3';

type RegisterForm = {
  email: string;
  shop_name: string;
  password: string;
};

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

export default function RegisterPage() {
  if (!RECAPTCHA_SITE_KEY) {
    return <RegisterFormView />;
  }
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
      <RegisterFormView />
    </GoogleReCaptchaProvider>
  );
}

function RegisterFormView() {
  const t = useTranslations('auth.register');
  const tc = useTranslations('auth.common');
  const router = useRouter();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [showPwd, setShowPwd] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(tc('invalid_email')),
        shop_name: z.string().min(2, t('shop_name_required')),
        password: z.string().min(8, t('password_min')),
      }),
    [t, tc],
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  async function onSubmit(data: RegisterForm) {
    let recaptcha_token = '';
    if (RECAPTCHA_SITE_KEY) {
      if (!executeRecaptcha) {
        setError('root', { message: t('error_generic') });
        return;
      }
      try {
        recaptcha_token = await executeRecaptcha('register');
      } catch {
        setError('root', { message: t('error_generic') });
        return;
      }
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, recaptcha_token }),
    });
    if (!res.ok) {
      setError('root', { message: t('error_generic') });
      return;
    }
    router.replace('/dashboard');
  }

  return (
    <>
    <div className="au-card">
      <h1>
        {t('headline_lead')}{' '}
        <span className="serif-i">{t('headline_accent')}</span>
      </h1>
      <p className="au-sub">{t('subtitle')}</p>
      <div className="au-divider" />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="au-field">
          <label htmlFor="shop_name">{t('shop_name')}</label>
          <input
            id="shop_name"
            className="au-input"
            placeholder={t('shop_name_placeholder')}
            autoComplete="organization"
            {...register('shop_name')}
          />
          {errors.shop_name && <p className="au-error">{errors.shop_name.message}</p>}
        </div>

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
              placeholder={t('password_placeholder')}
              autoComplete="new-password"
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
        {t('have_account')}{' '}
        <Link href="/login">{t('signin_link')}</Link>
      </p>
    </div>

    <p className="au-trust">
      <span className="dot" aria-hidden />
      {t('trust_line')}
    </p>
    </>
  );
}
