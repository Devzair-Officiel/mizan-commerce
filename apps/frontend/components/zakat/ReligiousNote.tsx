'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { ZAKAT_REASONING, type ReasoningKey } from '@/lib/zakat-reasoning';

interface ReligiousNoteProps {
  rubric: ReasoningKey;
  /** Si `true`, déplié à l'ouverture (utile sur la page détail). */
  defaultOpen?: boolean;
}

export function ReligiousNote({ rubric, defaultOpen = false }: ReligiousNoteProps) {
  const [open, setOpen] = useState(defaultOpen);
  const note = ZAKAT_REASONING[rubric];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        aria-expanded={open}
      >
        <BookOpen className="text-primary shrink-0" size={14} />
        <span className="flex-1 text-xs font-medium text-foreground">
          Pourquoi cette question&nbsp;? <span className="text-muted-foreground font-normal">— {note.title}</span>
        </span>
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-3 flex flex-col gap-2 border-t border-border/40">
          <p className="text-xs text-muted-foreground leading-relaxed pt-2">
            <span className="text-foreground font-medium">Fondement&nbsp;:</span> {note.fondement}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">Dans Mizan&nbsp;:</span> {note.application}
          </p>
          {note.source && (
            <p className="text-[11px] text-muted-foreground/70 italic">Source : {note.source}</p>
          )}
        </div>
      )}
    </div>
  );
}
