'use client';

import { useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { ComponentPropsWithoutRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

function DialogContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          'fixed inset-0 z-50 bg-black/50 dark:bg-black/60 backdrop-blur-sm',
          'transition-opacity duration-200',
          'data-starting-style:opacity-0 data-ending-style:opacity-0',
        )}
      />
      <DialogPrimitive.Popup
        className={cn(
          'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          'w-[calc(100%-2rem)] max-w-md',
          'bg-card text-foreground border border-border rounded-2xl shadow-xl',
          'p-6 outline-none',
          'transition-all duration-200',
          'data-starting-style:opacity-0 data-starting-style:scale-95',
          'data-ending-style:opacity-0 data-ending-style:scale-95',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 mb-4', className)} {...props} />;
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-6', className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-semibold text-foreground leading-tight', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function DialogClose({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      className={cn(
        'absolute right-4 top-4 rounded-full p-1.5',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        'transition-colors',
        className,
      )}
      {...props}
    />
  );
}

// ---

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Focus le bouton Annuler par défaut pour éviter qu'une touche Entrée
  // réflexe déclenche l'action destructive.
  const cancelRef = useRef<HTMLButtonElement>(null);

  function handleOpenChange(nextOpen: boolean) {
    // Bloque Escape et clic backdrop pendant l'exécution.
    if (busy && !nextOpen) return;
    if (!nextOpen) setError(null);
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal={busy}>
      <DialogContent initialFocus={cancelRef}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {(description || error) && (
            <DialogDescription className={error ? 'text-destructive' : undefined}>
              {error ?? description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          {/* Bouton natif pour permettre le ref — stylé via buttonVariants */}
          <button
            ref={cancelRef}
            type="button"
            className={cn(buttonVariants({ variant: 'outline' }), 'active:scale-[0.98]')}
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <Button
            type="button"
            variant={variant}
            className="active:scale-[0.98]"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  ConfirmDialog,
};
