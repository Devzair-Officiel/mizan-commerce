'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutList } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import {
  type PublicPage,
  type PublicPageSection,
  type PublicSectionType,
  useReorderSections,
  useUpdateSection,
} from '@/lib/hooks/usePublicPageAdmin';

const SECTION_META: Record<PublicSectionType, {
  label: string;
  titlePlaceholder: string;
  hasContent: boolean;
  hasTitle: boolean;
  contentPlaceholder?: string;
}> = {
  header: {
    label: 'En-tête',
    titlePlaceholder: '',
    hasContent: false,
    hasTitle: false,
  },
  description: {
    label: 'Présentation',
    titlePlaceholder: 'À propos de la boutique',
    hasContent: true,
    hasTitle: true,
    contentPlaceholder: 'Quelques mots sur votre boutique, votre histoire, vos engagements…',
  },
  products: {
    label: 'Produits',
    titlePlaceholder: 'Nos produits',
    hasContent: false,
    hasTitle: true,
  },
  services: {
    label: 'Services',
    titlePlaceholder: 'Nos services',
    hasContent: false,
    hasTitle: true,
  },
  contact: {
    label: 'Contact',
    titlePlaceholder: 'Nous contacter',
    hasContent: true,
    hasTitle: true,
    contentPlaceholder: 'Horaires, adresse, disponibilité…',
  },
};

interface Props {
  page: PublicPage;
}

export function SectionsCard({ page }: Props) {
  const sections = [...page.sections].sort((a, b) => a.position - b.position);

  return (
    <SettingsCard
      icon={LayoutList}
      title="Sections de la page"
      description="Ordre, visibilité et contenu de chaque bloc."
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
            aria-label="Monter"
            disabled={index === 0 || reorder.isPending}
            onClick={() => move(-1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Descendre"
            disabled={index === total - 1 || reorder.isPending}
            onClick={() => move(1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{meta.label}</p>
        </div>

        <button
          type="button"
          onClick={patchVisible}
          aria-label={section.is_visible ? 'Masquer' : 'Afficher'}
          className={`shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
            section.is_visible
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'
          }`}
        >
          {section.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>

      {section.is_visible && (meta.hasTitle || meta.hasContent) && (
        <div className="flex flex-col gap-2 pl-6">
          {meta.hasTitle && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              placeholder={meta.titlePlaceholder}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          )}
          {meta.hasContent && (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={saveContent}
              placeholder={meta.contentPlaceholder}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          )}
        </div>
      )}
    </li>
  );
}
