import { useTranslations } from 'next-intl';
import { ReligiousNote } from '@/components/zakat/ReligiousNote';

export function ReligiousNotesGroup() {
  const t = useTranslations('zakat.detail');
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
        {t('religious_title')}
      </p>
      <ReligiousNote rubric="cash" />
      <ReligiousNote rubric="receivables" />
      <ReligiousNote rubric="stock" />
      <ReligiousNote rubric="excluded" />
      <ReligiousNote rubric="debts" />
      <ReligiousNote rubric="nisab" />
      <ReligiousNote rubric="rate" />
    </div>
  );
}
