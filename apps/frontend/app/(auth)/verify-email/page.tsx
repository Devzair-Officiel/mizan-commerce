'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-foreground">Mizan</h1>
        <Card className="w-full shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {status === 'loading' && (
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            )}
            {status === 'success' && (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-muted-foreground">{t('success')}</p>
                <Link href="/login">
                  <Button className="w-full">{t('signin_cta')}</Button>
                </Link>
              </div>
            )}
            {status === 'error' && (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-red-500">{tc('invalid_or_expired_link')}</p>
                <Link href="/login">
                  <Button variant="outline" className="w-full">{tc('back_to_login')}</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
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
