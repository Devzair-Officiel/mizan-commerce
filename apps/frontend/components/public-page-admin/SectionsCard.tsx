'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutList } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import {
  type PublicPage,
  type PublicPageSection,
  type PublicSectionType,
  useReorderSections,
  useUpdateSection,
} from '@/lib/hooks/usePublicPageAdmin';

// Libellés et textes indicatifs sous `public_page_admin.sections.types.<type>.{label,title,content}`.
const SECTION_META: Record<PublicSectionType, { hasTitle: boolean; hasContent: boolean }> = {
  header: { hasTitle: false, hasContent: false },
  description: { hasTitle: true, hasContent: true },
  products: { hasTitle: true, hasContent: false },
  services: { hasTitle: true, hasContent: false },
  contact: { hasTitle: true, hasContent: true },
};

interface Props {
  page: PublicPage;
}

export function SectionsCard({ page }: Props) {
  const t = useTranslations('public_page_admin.sections');
  const sections = [...page.sections].sort((a, b) => a.position - b.position);

  return (
    <SettingsCard
      icon={LayoutList}
      title={t('title')}
      description={t('description')}
    >
      <ul className="flex flex-col gap-2">
        {sections.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            index={index}
            total={sections.length}
            allSections={sections}
          />
        ))}
      </ul>
    </SettingsCard>
  );
}

interface RowProps {
  section: PublicPageSection;
  index: number;
  total: number;
  allSections: PublicPageSection[];
}

function SectionRow({ section, index, total, allSections }: RowProps) {
  const t = useTranslations('public_page_admin.sections');
  const meta = SECTION_META[section.type];
  const updateSection = useUpdateSection();
  const reorder = useReorderSections();

  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);

  function patchVisible() {
    updateSection.mutate({ id: section.id, data: { is_visible: !section.is_visible } });
  }

  function saveTitle() {
    if (title !== section.title) {
      updateSection.mutate({ id: section.id, data: { title } });
    }
  }

  function saveContent() {
    if (content !== section.content) {
      updateSection.mutate({ id: section.id, data: { content } });
    }
  }

  function move(delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= total) return;
    const reordered = [...allSections];
    const moved = reordered[index];
    if (!moved) return;
    reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    reorder.mutate(reordered.map((s, i) => ({ id: s.id, position: i })));
  }

  return (
    <li className={`rounded-2xl border border-border bg-card p-3 flex flex-col gap-2 ${section.is_visible ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            aria-label={t('move_up')}
            disabled={index === 0 || reorder.isPending}
            onClick={() => move(-1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t('move_down')}
            disabled={index === total - 1 || reorder.isPending}
            onClick={() => move(1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{t(`types.${section.type}.label`)}</p>
        </div>

        <button
          type="button"
          onClick={patchVisible}
          aria-label={section.is_visible ? t('hide') : t('show')}
          className={`shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
            section.is_visible
              ? 'bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          {section.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>

      {section.is_visible && (meta.hasTitle || meta.hasContent) && (
        <div className="flex flex-col gap-2 ps-6">
          {meta.hasTitle && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              placeholder={t(`types.${section.type}.title`)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          )}
          {meta.hasContent && (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={saveContent}
              placeholder={t(`types.${section.type}.content`)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          )}
        </div>
      )}
    </li>
  );
}
