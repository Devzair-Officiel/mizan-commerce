'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, RotateCw, Smartphone, Tablet } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import type { PublicPage } from '@/lib/hooks/usePublicPageAdmin';

type Device = 'mobile' | 'tablet';

const DEVICE_WIDTHS: Record<Device, number> = {
  mobile: 375,
  tablet: 768,
};

interface Props {
  page: PublicPage;
}

export function PreviewCard({ page }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<Device>('mobile');
  // Sert de cache-buster pour forcer le rechargement de l'iframe quand la
  // page change côté admin (chaque save met à jour `updated_at`).
  const src = `/boutique/${page.slug}?preview=1&v=${encodeURIComponent(page.updated_at)}`;

  const [isReloading, setIsReloading] = useState(false);
  useEffect(() => {
    setIsReloading(true);
    const t = setTimeout(() => setIsReloading(false), 400);
    return () => clearTimeout(t);
  }, [src]);

  function handleManualReload() {
    iframeRef.current?.contentWindow?.location.reload();
  }

  const frameWidth = DEVICE_WIDTHS[device];

  return (
    <SettingsCard
      icon={Eye}
      title="Aperçu live"
      description="Ce que voient vos clients. Mis à jour à chaque enregistrement."
    >
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              device === 'mobile' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
            aria-pressed={device === 'mobile'}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Mobile
          </button>
          <button
            type="button"
            onClick={() => setDevice('tablet')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              device === 'tablet' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
            aria-pressed={device === 'tablet'}
          >
            <Tablet className="h-3.5 w-3.5" />
            Tablette
          </button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleManualReload}
          className="ml-auto"
        >
          <RotateCw className={`h-3.5 w-3.5 mr-1 ${isReloading ? 'animate-spin' : ''}`} />
          Recharger
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-muted p-3">
        <div
          className="mx-auto overflow-hidden rounded-[2rem] border border-border bg-background shadow-sm"
          style={{ width: frameWidth, maxWidth: '100%' }}
        >
          <iframe
            ref={iframeRef}
            src={src}
            title="Aperçu de la vitrine"
            className="block w-full h-160 border-0"
            // `allow-popups` : nécessaire pour que le devtools Next.js en dev
            // puisse ouvrir sa fenêtre picture-in-picture (sinon erreur console
            // en boucle). Pas d'allow-top-navigation : l'iframe ne peut pas
            // détourner la page de l'éditeur.
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </SettingsCard>
  );
}
