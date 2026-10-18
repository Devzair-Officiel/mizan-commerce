'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BASIS, RECIPIENT_CATEGORIES, type BasisChoices, type BasisTopic } from './basisCatalog';
import { BasisOpinions } from './BasisOpinions';
import { BasisSources } from './BasisSources';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-4">
      <h3 className="mb-2 text-[0.8125rem] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

interface BasisTopicViewProps {
  topic: BasisTopic;
  choices: BasisChoices;
  onBack: () => void;
}

/** Une fiche, toujours en trois blocs : la règle, les sources et leur badge, les avis (ou les huit catégories). */
export function BasisTopicView({ topic, choices, onBack }: BasisTopicViewProps) {
  const t = useTranslations('zakat.basis');
  const entry = BASIS[topic];
  return (
    <>
      <button
        type="button"
        data-basis-back
        onClick={onBack}
        className="-ms-1 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-primary/30"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('back')}
      </button>
      <div className="divide-y divide-border">
        <Block title={t('rule')}>
          <p className="text-sm leading-relaxed text-foreground">{t(`topic.${topic}.rule`)}</p>
          {entry.detail && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`topic.${topic}.detail`)}</p>}
        </Block>
        <Block title={t('sources')}>
          <BasisSources sources={entry.sources} />
        </Block>
        {topic === 'recipients' ? (
          <Block title={t('categories')}>
            <ol className="list-decimal space-y-1.5 ps-5 text-sm text-foreground marker:text-muted-foreground">
              {RECIPIENT_CATEGORIES.map((n) => <li key={n}>{t(`category.${n}`)}</li>)}
            </ol>
          </Block>
        ) : (
          <Block title={t('opinions')}>
            <BasisOpinions groups={entry.opinions} choices={choices} />
          </Block>
        )}
      </div>
    </>
  );
}
