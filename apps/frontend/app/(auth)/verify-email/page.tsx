'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Status = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
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
            <CardTitle className="text-lg">Vérification de l&apos;email</CardTitle>
          </CardHeader>
          <CardContent>
            {status === 'loading' && (
              <p className="text-sm text-muted-foreground">Vérification en cours…</p>
            )}
            {status === 'success' && (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-muted-foreground">Votre email a été vérifié. Vous pouvez maintenant vous connecter.</p>
                <Link href="/login">
                  <Button className="w-full">Se connecter</Button>
                </Link>
              </div>
            )}
            {status === 'error' && (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm text-red-500">Lien invalide ou expiré.</p>
                <Link href="/login">
                  <Button variant="outline" className="w-full">Retour à la connexion</Button>
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
