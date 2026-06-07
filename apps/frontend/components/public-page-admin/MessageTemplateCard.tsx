'use client';

import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { DEFAULT_ORDER_MESSAGE_TEMPLATE, buildOrderMessage } from '@/lib/order-message';
import { type PublicPage, useUpdatePublicPage } from '@/lib/hooks/usePublicPageAdmin';

const MAX_LEN = 500;

interface Props {
  page: PublicPage;
}

export function MessageTemplateCard({ page }: Props) {
  const update = useUpdatePublicPage();
  const [value, setValue] = useState(page.order_message_template);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(page.order_message_template);
  }, [page.order_message_template]);

  const isDirty = value !== page.order_message_template;
  const isOverLimit = value.length > MAX_LEN;

  async function handleSave() {
    if (isOverLimit) return;
    setError(null);
    try {
      await update.mutateAsync({ order_message_template: value });
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { order_message_template?: string[]; detail?: string } | null;
        setError(data?.order_message_template?.[0] ?? data?.detail ?? 'Mise à jour impossible');
      } else {
        setError('Mise à jour impossible');
      }
    }
  }

  function handleReset() {
    setValue(DEFAULT_ORDER_MESSAGE_TEMPLATE);
  }

  const previewName = page.display_name || page.slug;
  const preview = buildOrderMessage(value, {
    shop_name: previewName,
    item_name: 'Tajine en céramique',
    price_label: '4 500 DA',
  });

  return (
    <SettingsCard
      icon={MessageSquare}
      title="Message d'intérêt"
      description="Texte pré-rempli envoyé au commerçant via WhatsApp depuis la fiche d'un article."
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="order-message-template" className="text-[11px] text-muted-foreground px-1">
          Modèle
        </label>
        <textarea
          id="order-message-template"
          rows={4}
          value={value}
          maxLength={MAX_LEN + 50}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground transition-[border-color,box-shadow] duration-200 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-muted-foreground">
            Placeholders :{' '}
            <code className="font-mono">{'{shop_name}'}</code>{' · '}
            <code className="font-mono">{'{item_name}'}</code>{' · '}
            <code className="font-mono">{'{price}'}</code>
          </p>
          <span className={`text-[11px] tabular-nums ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
            {value.length}/{MAX_LEN}
          </span>
        </div>
      </div>

      <div className="rounded-2xl bg-muted px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Aperçu
        </span>
        <p className="text-sm text-foreground whitespace-pre-line mt-1">{preview}</p>
      </div>

      {error && <p className="text-xs text-destructive text-center">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
          Réinitialiser
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!isDirty || isOverLimit || update.isPending}
          onClick={handleSave}
        >
          {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </SettingsCard>
  );
}
