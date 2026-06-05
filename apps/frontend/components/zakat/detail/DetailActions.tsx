import { Pencil, Trash2 } from 'lucide-react';

interface DetailActionsProps {
  isFinalized: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  isDeleting: boolean;
}

export function DetailActions({ isFinalized, onEdit, onDelete, isEditing, isDeleting }: DetailActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {isFinalized && (
        <button
          type="button"
          onClick={onEdit}
          disabled={isEditing}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
        >
          <Pencil size={14} />
          {isEditing ? 'Réouverture…' : 'Modifier'}
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className={`flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 ${
          isFinalized ? '' : 'col-span-2'
        }`}
      >
        <Trash2 size={14} />
        {isDeleting ? 'Suppression…' : 'Supprimer'}
      </button>
    </div>
  );
}
