'use client';

import { useTranslations } from 'next-intl';
import { StickyNote, X } from 'lucide-react';
import { FloatingTextarea } from '@/components/ui/floating-fields';

interface NotesSectionProps {
  notes: string;
  showNotes: boolean;
  onNotesChange: (v: string) => void;
  onShow: () => void;
  onHide: () => void;
}

export function NotesSection({
  notes, showNotes, onNotesChange, onShow, onHide,
}: NotesSectionProps) {
  const t = useTranslations('orders.new');
  if (showNotes || notes) {
    return (
      <div className="relative">
        <FloatingTextarea
          id="notes"
          label={t('notes_label')}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          autoFocus={showNotes && !notes}
        />
        {!notes && (
          <button
            type="button"
            onClick={onHide}
            aria-label={t('notes_hide_aria')}
            className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onShow}
      className="self-start flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
    >
      <StickyNote size={16} />
      <span>{t('notes_show')}</span>
    </button>
  );
}
