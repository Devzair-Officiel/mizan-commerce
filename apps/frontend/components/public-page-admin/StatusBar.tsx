'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type PublicPage,
  usePublishPublicPage,
  useUnpublishPublicPage,
} from '@/lib/hooks/usePublicPageAdmin';

interface Props {
  page: PublicPage;
}

export function StatusBar({ page }: Props) {
  const publish = usePublishPublicPage();
  const unpublish = useUnpublishPublicPage();
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const fullUrl = `${origin}/boutique/${page.slug}`;
  const visibleUrl = `${origin.replace(/^https?:\/\//, '')}/boutique/${page.slug}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refusé (HTTP, permissions) — pas d'action, l'utilisateur peut copier manuellement.
    }
  }

  const isPending = publish.isPending || unpublish.isPending;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-border bg-card/95 backdrop-blur px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0 gap-1">
          <StatusBadge isLive={page.is_live} />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-muted-foreground truncate">{visibleUrl}</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copier l'URL"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                : <Copy className="h-3.5 w-3.5" />}
            </button>
            {page.is_live && (
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ouvrir la page publique"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        {page.is_live ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => unpublish.mutate()}
          >
            {unpublish.isPending ? 'Dépublication…' : 'Dépublier'}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => publish.mutate()}
          >
            {publish.isPending ? 'Publication…' : 'Publier'}
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ isLive }: { isLive: boolean }) {
  return isLive ? (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      En ligne
    </span>
  ) : (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-neutral-200 text-neutral-700 px-2 py-0.5 text-[11px] font-semibold">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
      Brouillon
    </span>
  );
}
