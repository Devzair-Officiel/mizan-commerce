'use client';

import { useTranslations } from 'next-intl';
import type { ChipKey } from '../choice/choiceCatalog';
import type { BasisChoices, BasisOpinionGroup } from './basisCatalog';

interface OpinionRow {
  id: string;
  titleKey: string;
  noteKey?: string;
  chips: readonly ChipKey[];
  chosen: boolean;
}

/** Avis d'un groupe, avec leurs clés de texte ; « Votre choix » seulement pour un choix fait dans Mizan. */
function rowsOf(group: BasisOpinionGroup, choices: BasisChoices): OpinionRow[] {
  if ('choice' in group) {
    const { choice } = group;
    return group.items.map(({ option, chips, note }) => ({
      id: option, chips, chosen: choices[choice] === option,
      titleKey: `choice.${choice}.${option}.title`,
      noteKey: note ? `basis.choice_note.${choice}.${option}` : undefined,
    }));
  }
  const base = `basis.opinion.${group.group}`;
  return group.items.map(({ key, chips, note }) => ({
    id: key, chips, chosen: false, titleKey: `${base}.${key}.title`, noteKey: note ? `${base}.${key}.note` : undefined,
  }));
}

/** Les avis d'une fiche : l'option, qui la retient, « Votre choix ». Sans avis : point d'accord. */
export function BasisOpinions({ groups, choices }: { groups: readonly BasisOpinionGroup[]; choices: BasisChoices }) {
  const t = useTranslations('zakat');
  if (groups.length === 0) return <p className="text-sm leading-relaxed text-foreground">{t('basis.agreement')}</p>;
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={'choice' in group ? group.choice : group.group}>
          {groups.length > 1 && (
            <h4 className="text-[0.8125rem] font-semibold text-foreground">
              {t('choice' in group ? `basis.heading.${group.choice}` : `basis.opinion.${group.group}.title`)}
            </h4>
          )}
          <ul className="divide-y divide-dashed divide-border">
            {rowsOf(group, choices).map((row) => (
              <li key={row.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2.5">
                  <p className="text-sm font-semibold text-foreground">{t(row.titleKey)}</p>
                  {row.chosen && <span className="shrink-0 whitespace-nowrap text-[0.71875rem] font-semibold text-primary">{t('basis.your_choice')}</span>}
                </div>
                {row.noteKey && <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">{t(row.noteKey)}</p>}
                {row.chips.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {row.chips.map((chip) => (
                      <span key={chip} className="inline-flex h-5.5 items-center whitespace-nowrap rounded-full border border-border bg-card px-2 text-[0.71875rem] font-semibold text-muted-foreground">
                        {t(`chip.${chip}`)}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
