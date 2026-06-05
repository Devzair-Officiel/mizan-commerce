'use client';

import { Suspense, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type FormData = { new_password: string; confirm_password: string };

function ResetPasswordForm() {
  const t = useTranslations('auth.resetPassword');
  const tc = useTranslations('auth.common');
  const params = useSearchParams();
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);

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
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-sm text-red-500">{t('invalid_link')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-foreground">Mizan</h1>
        <Card className="w-full shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-muted-foreground">{t('done')}</p>
                <Link href="/login">
                  <Button className="w-full">{t('signin_cta')}</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new_password">{t('new_password')}</Label>
                  <PasswordInput
                    id="new_password"
                    autoComplete="new-password"
                    {...register('new_password')}
                  />
                  {errors.new_password && (
                    <p className="text-xs text-red-500">{errors.new_password.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm_password">{t('confirm_password')}</Label>
                  <PasswordInput
                    id="confirm_password"
                    autoComplete="new-password"
                    {...register('confirm_password')}
                  />
                  {errors.confirm_password && (
                    <p className="text-xs text-red-500">{errors.confirm_password.message}</p>
                  )}
                </div>
                {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? t('submitting') : t('submit')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
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
