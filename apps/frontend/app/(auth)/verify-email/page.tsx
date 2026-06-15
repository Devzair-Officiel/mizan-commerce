'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, ShieldAlert } from 'lucide-react';

type Status = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const t = useTranslations('auth.verifyEmail');
  const tc = useTranslations('auth.common');
  const params = useSearchParams();
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(uid && token ? 'loading' : 'error');

  useEffect(() => {
    if (!uid || !token) return;
    fetch(`/api/auth/verify-email?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}`)
      .then((res) => setStatus(res.ok ? 'success' : 'error'))
      .catch(() => setStatus('error'));
  }, [uid, token]);

  if (status === 'loading') {
    return (
      <div className="au-card">
        <h1>
          {t('headline_lead')}{' '}
          <span className="serif-i">{t('headline_accent')}</span>
        </h1>
        <p className="au-sub">{t('loading')}</p>
        <div className="au-divider" />
        <div className="au-spinner-wrap" role="status" aria-live="polite">
          <div className="au-spinner" aria-hidden />
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="au-card au-confirm">
        <div className="au-confirm-icon" aria-hidden>
          <Check size={28} strokeWidth={2.5} />
        </div>
        <h1 className="au-confirm-title">{t('success_title')}</h1>
        <p>{t('success')}</p>
        <div className="au-confirm-actions">
          <Link href="/login" className="au-cta">
            {t('signin_cta')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="au-card au-confirm">
      <div className="au-confirm-icon is-error" aria-hidden>
        <ShieldAlert size={28} strokeWidth={2.25} />
      </div>
      <h1 className="au-confirm-title">{t('error_title')}</h1>
      <p>{tc('invalid_or_expired_link')}</p>
      <div className="au-confirm-actions">
        <Link href="/login" className="au-cta-ghost">
          {tc('back_to_login')}
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
