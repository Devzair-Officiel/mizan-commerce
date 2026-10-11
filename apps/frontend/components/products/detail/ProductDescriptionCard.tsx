import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';

/** Description saisie sur le formulaire, telle quelle (retours à la ligne conservés). */
export function ProductDescriptionCard({ description }: { description: string }) {
  const t = useTranslations('articles.sheet');
  return (
    <SectionCard title={t('description_title')}>
      <p dir="auto" className="whitespace-pre-line px-4 py-4 text-sm lg:px-5">{description}</p>
    </SectionCard>
  );
}
