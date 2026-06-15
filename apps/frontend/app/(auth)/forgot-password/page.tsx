'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';

type FormData = { email: string };

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword');
  const tc = useTranslations('auth.common');
  const [sent, setSent] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(tc('invalid_email')),
      }),
    [tc],
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setSent(true);
    } catch {
      setError('root', { message: t('error_generic') });
    }
  }

  if (sent) {
    return (
      <div className="au-card au-confirm">
        <div className="au-confirm-icon" aria-hidden>
          <Mail size={28} strokeWidth={2.25} />
        </div>
        <h1 className="au-confirm-title">{t('sent_title')}</h1>
        <p>{t('sent')}</p>
        <div className="au-confirm-actions">
          <Link href="/login" className="au-cta-ghost">
            {tc('back_to_login')}
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
