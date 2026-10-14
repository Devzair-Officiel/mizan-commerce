'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form/FormField';
import { FormSelect } from '@/components/form/FormSelect';
import { FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import type { MessageTemplateKey } from '@/lib/hooks/useMessageTemplates';

export interface TemplateItem {
  key: MessageTemplateKey;
  label: string;
  customized: boolean;
}

interface TemplateEditorProps {
  templates: readonly TemplateItem[];
  selected: MessageTemplateKey;
  onSelect: (key: MessageTemplateKey) => void;
  text: string;
  onTextChange: (text: string) => void;
  onReset: () => void;
  error?: string;
  /** Où le modèle est proposé (« Utilisé par « Relancer »… »). */
  usedBy: string;
  variables: readonly string[];
}

const NAV_ITEM = 'flex h-10.5 w-full items-center justify-between gap-2 rounded-[0.625rem] px-3 text-start text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-primary/30';

/** « Insérer une information : » et un bouton par variable. */
function VariableChips({ variables, onInsert }: { variables: readonly string[]; onInsert: (variable: string) => void }) {
  const t = useTranslations('settings.messages');
  return (
    <>
      <p className="text-xs text-muted-foreground">{t('insert_label')}</p>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((v) => (
          <button key={v} type="button" onClick={() => onInsert(v)} aria-label={t('insert_aria', { variable: `{${v}}` })} dir="ltr"
            className="h-7.5 rounded-full border border-border bg-card px-2.5 font-mono text-xs font-semibold text-foreground transition-colors hover:bg-muted">
            {`{${v}}`}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Liste des modèles à gauche (menu de choix quand la carte est étroite), texte à droite, boutons
 * qui insèrent une variable à la position du curseur, puis « Utilisé par… » et « Rétablir ».
 */
export function TemplateEditor({ templates, selected, onSelect, text, onTextChange, onReset, error, usedBy, variables }: TemplateEditorProps) {
  const t = useTranslations('settings.messages');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const current = templates.find((tpl) => tpl.key === selected);

  function insert(variable: string) {
    const el = textarea.current;
    const token = `{${variable}}`;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    onTextChange(text.slice(0, start) + token + text.slice(end));
    // Après le rendu du nouveau texte : curseur juste après la variable insérée.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="@container">
      <div className="flex flex-col gap-4 @xl:flex-row">
        <nav aria-label={t('templates_title')} className="hidden w-50 shrink-0 flex-col gap-0.5 @xl:flex">
          {templates.map((tpl) => (
            <button key={tpl.key} type="button" aria-current={tpl.key === selected ? 'true' : undefined} onClick={() => onSelect(tpl.key)}
              className={`${NAV_ITEM} ${tpl.key === selected ? 'bg-secondary font-semibold text-secondary-foreground' : 'font-medium text-foreground hover:bg-muted'}`}>
              {tpl.label}
              {tpl.customized && <span className="text-[0.6875rem] font-semibold text-muted-foreground">{t('customized')}</span>}
            </button>
          ))}
        </nav>
        <div className="@xl:hidden">
          <FormField label={t('template_label')}>
            {(c) => <FormSelect control={c} value={selected} onChange={onSelect}
              options={templates.map((tpl) => ({ value: tpl.key, label: tpl.customized ? t('customized_option', { label: tpl.label }) : tpl.label }))} />}
          </FormField>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <FormField label={t('text_label')} error={error}>
            {(c) => <textarea {...c} ref={textarea} value={text} onChange={(e) => onTextChange(e.target.value)} rows={7} dir="auto"
              className={`${FIELD_TEXTAREA} leading-normal`} />}
          </FormField>
          <VariableChips variables={variables} onInsert={insert} />
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-xs text-muted-foreground">{usedBy}</span>
            {current?.customized && (
              <button type="button" onClick={onReset} className="min-h-8 text-[0.8125rem] font-semibold text-primary hover:underline underline-offset-4">
                {t('reset')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
