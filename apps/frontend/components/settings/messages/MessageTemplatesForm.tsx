'use client';

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { List, MessageSquare } from 'lucide-react';
import { FormActions } from '@/components/form/FormActions';
import { FormSection } from '@/components/form/FormSection';
import { SETTINGS_COLUMN, SETTINGS_COLUMNS } from '@/components/settings/layoutStyles';
import { useFormLeave } from '@/components/form/useFormLeave';
import { MESSAGE_TEMPLATES, type MessageSettings, type MessageTemplateKey } from '@/lib/hooks/useMessageTemplates';
import { useShop } from '@/lib/hooks/useShop';
import { MessagePreviewCard } from './MessagePreviewCard';
import { TemplateEditor } from './TemplateEditor';
import { ToneCards } from './ToneCards';
import { useMessageTemplatesForm } from './useMessageTemplatesForm';

interface MessageTemplatesFormProps {
  settings: MessageSettings;
  initialTemplate: MessageTemplateKey;
  onLeave: () => void;
}

/**
 * Ton et modèles au gabarit v3. Colonne principale : Ton, Modèles ; colonne latérale : Aperçu.
 * Un modèle non personnalisé (`null`) affiche le texte du ton choisi et le suit quand le ton change.
 */
export function MessageTemplatesForm({ settings, initialTemplate, onLeave }: MessageTemplatesFormProps) {
  const t = useTranslations('settings.messages');
  const [selected, setSelected] = useState(initialTemplate);
  const { form, submit, isSubmitting } = useMessageTemplatesForm(settings, setSelected);
  const { control, setValue, formState: { errors, isDirty } } = form;
  const [tone, custom] = useWatch({ control, name: ['tone', 'custom'] });
  const mode = useShop().data?.fulfillment_mode ?? 'other';
  const cancel = useFormLeave(isDirty && !isSubmitting, onLeave);

  const defaults = settings.defaults[tone];
  const text = custom[selected] ?? defaults[selected];
  const templates = MESSAGE_TEMPLATES.map((key) => ({ key, label: t('template', { key, mode }), customized: custom[key] !== null }));

  // Un texte identique à celui du ton redevient « non personnalisé » : il suivra le ton.
  const setText = (value: string | null) => setValue(`custom.${selected}`, value === defaults[selected] ? null : value,
    { shouldDirty: true, shouldValidate: Boolean(errors.custom?.[selected]) });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      <div className={SETTINGS_COLUMNS}>
        <div className={SETTINGS_COLUMN}>
          <FormSection icon={MessageSquare} order="max-lg:order-1" title={t('tone_title')} description={t('tone_description')}>
            <ToneCards value={tone} onChange={(value) => setValue('tone', value, { shouldDirty: true })} />
          </FormSection>
          <FormSection icon={List} order="max-lg:order-2" title={t('templates_title')}>
            <TemplateEditor templates={templates} selected={selected} onSelect={setSelected} text={text}
              onTextChange={setText} onReset={() => setText(null)} error={errors.custom?.[selected]?.message}
              usedBy={t('used_by', { key: selected, mode })} variables={settings.variables} />
          </FormSection>
        </div>
        <div className={SETTINGS_COLUMN}>
          <MessagePreviewCard text={text} tone={tone} />
        </div>
      </div>
      <FormActions dirty={isDirty} submitting={isSubmitting} submitLabel={t('submit')} submitDisabled={!isDirty} onCancel={cancel} />
    </form>
  );
}
