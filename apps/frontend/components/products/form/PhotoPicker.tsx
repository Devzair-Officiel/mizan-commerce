import { useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { AlertCircle, Camera, X } from 'lucide-react';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

interface PhotoPickerProps {
  file: File | null;
  error: string | null;
  onChange: (file: File | null, error: string | null) => void;
}

export function PhotoPicker({ file, error, onChange }: PhotoPickerProps) {
  const t = useTranslations('articles.photo');
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleFiles(files: FileList | null) {
    const next = files?.[0] ?? null;
    if (!next) {
      onChange(null, null);
      return;
    }
    if (!next.type.startsWith('image/')) {
      onChange(null, t('format_unsupported'));
      return;
    }
    if (next.size > MAX_IMAGE_SIZE) {
      onChange(null, t('too_heavy'));
      return;
    }
    onChange(next, null);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    if (inputRef.current) inputRef.current.value = '';
    onChange(null, null);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-2 pr-4 active:scale-[0.99] transition-transform text-left"
      >
        <span className="relative flex h-16 w-16 items-center justify-center rounded-xl bg-muted/40 overflow-hidden shrink-0">
          {previewUrl ? (
            <>
              <Image
                src={previewUrl}
                alt={t('preview_alt')}
                width={64}
                height={64}
                unoptimized
                className="h-full w-full object-cover"
              />
              <span
                onClick={clear}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border shadow"
                aria-label={t('remove_aria')}
              >
                <X size={11} className="text-foreground" />
              </span>
            </>
          ) : (
            <Camera size={18} className="text-muted-foreground" />
          )}
        </span>
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {previewUrl ? t('selected') : t('add_label')}
          </span>
          {error
            ? <span className="flex items-center gap-1 text-[11px] text-destructive"><AlertCircle size={11} /> {error}</span>
            : <span className="text-[11px] text-muted-foreground">{t('helper')}</span>}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
