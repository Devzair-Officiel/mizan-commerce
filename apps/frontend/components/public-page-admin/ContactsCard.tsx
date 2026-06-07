'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Eye, EyeOff, MessageCircle, Phone, Pencil, Plus, Send, Star, Trash2,
} from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import {
  type PublicContactButton,
  type PublicContactType,
  type PublicPage,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from '@/lib/hooks/usePublicPageAdmin';

const TYPE_META: Record<PublicContactType, {
  label: string;
  icon: typeof Phone;
  placeholder: string;
  hint: string;
}> = {
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    placeholder: '+33 6 12 34 56 78',
    hint: 'Numéro au format international',
  },
  telegram: {
    label: 'Telegram',
    icon: Send,
    placeholder: '@pseudo',
    hint: 'Nom d\'utilisateur Telegram',
  },
  instagram: {
    label: 'Instagram',
    icon: MessageCircle,
    placeholder: '@compte',
    hint: 'Nom d\'utilisateur Instagram',
  },
  phone: {
    label: 'Téléphone',
    icon: Phone,
    placeholder: '+33 6 12 34 56 78',
    hint: 'Numéro de téléphone',
  },
};

interface Props {
  page: PublicPage;
}

export function ContactsCard({ page }: Props) {
  const [editing, setEditing] = useState<PublicContactButton | null>(null);
  const [creating, setCreating] = useState(false);
  const sorted = [...page.contact_buttons].sort((a, b) => a.position - b.position);

  return (
    <SettingsCard
      icon={Phone}
      title="Boutons de contact"
      description="Comment vos clients vous joignent depuis la vitrine."
    >
      <div className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2 text-center">
            Aucun contact configuré.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((c) => (
              <ContactRow key={c.id} contact={c} onEdit={() => setEditing(c)} />
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCreating(true)}
          className="self-end"
        >
          <Plus className="h-4 w-4" />
          Ajouter un contact
        </Button>
      </div>

      <ContactFormSheet
        open={creating}
        onClose={() => setCreating(false)}
        mode="create"
      />
      <ContactFormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        mode="edit"
        contact={editing}
      />
    </SettingsCard>
  );
}

function ContactRow({ contact, onEdit }: { contact: PublicContactButton; onEdit: () => void }) {
  const update = useUpdateContact();
  const remove = useDeleteContact();
  const meta = TYPE_META[contact.type];
  const Icon = meta.icon;

  return (
    <li className={`rounded-2xl border border-border bg-card p-3 flex items-center gap-3 ${contact.is_visible ? '' : 'opacity-60'}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground truncate">
            {contact.label.trim() || meta.label}
          </p>
          {contact.is_primary && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold">
              <Star className="h-2.5 w-2.5 fill-current" />
              Principal
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{contact.value}</p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!contact.is_primary && (
          <button
            type="button"
            aria-label="Définir comme principal"
            onClick={() => update.mutate({ id: contact.id, data: { is_primary: true } })}
            className="p-1.5 text-muted-foreground hover:text-amber-600"
          >
            <Star className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={contact.is_visible ? 'Masquer' : 'Afficher'}
          onClick={() => update.mutate({ id: contact.id, data: { is_visible: !contact.is_visible } })}
          className="p-1.5 text-muted-foreground hover:text-foreground"
        >
          {contact.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label="Modifier"
          onClick={onEdit}
          className="p-1.5 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Supprimer"
          onClick={() => remove.mutate(contact.id)}
          className="p-1.5 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

const formSchema = z.object({
  type: z.enum(['whatsapp', 'telegram', 'instagram', 'phone']),
  value: z.string().min(1, 'Valeur requise').max(200),
  label: z.string().max(60).optional(),
  is_primary: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormSheetProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  contact?: PublicContactButton | null;
}

function ContactFormSheet({ open, onClose, mode, contact }: FormSheetProps) {
  const create = useCreateContact();
  const update = useUpdateContact();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaults: FormValues = {
    type: contact?.type ?? 'whatsapp',
    value: contact?.value ?? '',
    label: contact?.label ?? '',
    is_primary: contact?.is_primary ?? false,
  };

  const {
    register, handleSubmit, watch, setValue, reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (open) {
      reset({
        type: contact?.type ?? 'whatsapp',
        value: contact?.value ?? '',
        label: contact?.label ?? '',
        is_primary: contact?.is_primary ?? false,
      });
      setServerError(null);
    }
  }, [open, contact, reset]);

  const currentType = watch('type');
  const isPrimary = watch('is_primary');
  const meta = TYPE_META[currentType];

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      if (mode === 'create') {
        await create.mutateAsync({
          type: values.type,
          value: values.value,
          label: values.label || undefined,
          is_primary: values.is_primary,
        });
      } else if (contact) {
        await update.mutateAsync({
          id: contact.id,
          data: {
            value: values.value,
            label: values.label || '',
            is_primary: values.is_primary,
          },
        });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { value?: string[]; detail?: string } | null;
        setServerError(data?.value?.[0] ?? data?.detail ?? 'Enregistrement impossible');
      } else {
        setServerError('Enregistrement impossible');
      }
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Nouveau contact' : 'Modifier le contact'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 p-4 overflow-y-auto">
        {mode === 'create' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[11px] text-muted-foreground px-1">Canal</legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TYPE_META) as PublicContactType[]).map((t) => {
                const m = TYPE_META[t];
                const Icon = m.icon;
                return (
                  <label
                    key={t}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-colors ${
                      currentType === t
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-muted'
                    }`}
                  >
                    <input type="radio" value={t} {...register('type')} className="sr-only" />
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{m.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="value" className="text-[11px] text-muted-foreground px-1">
            {meta.hint} *
          </label>
          <input
            id="value"
            type="text"
            placeholder={meta.placeholder}
            {...register('value')}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
          {errors.value && <p className="text-[11px] text-destructive px-1">{errors.value.message}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="label" className="text-[11px] text-muted-foreground px-1">
            Libellé personnalisé (optionnel)
          </label>
          <input
            id="label"
            type="text"
            placeholder={meta.label}
            {...register('label')}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setValue('is_primary', e.target.checked, { shouldDirty: true })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm">Contact principal (utilisé pour les boutons "Commander")</span>
        </label>

        {serverError && (
          <p className="text-xs text-destructive text-center">{serverError}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
