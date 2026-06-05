import { Bell, X } from 'lucide-react';

interface CustomerFlashNotificationProps {
  visible: boolean;
  customerName: string;
  onDismiss: () => void;
}

export function CustomerFlashNotification({
  visible, customerName, onDismiss,
}: CustomerFlashNotificationProps) {
  return (
    <div
      className="fixed left-4 right-4 z-50 transition-all duration-300"
      style={{
        top: visible ? '72px' : '56px',
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
      }}
    >
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl backdrop-blur-sm"
        style={{ background: 'color-mix(in oklch, var(--primary) 78%, transparent)' }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Bell size={16} className="text-primary-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-primary-foreground">Rappel créé</p>
          <p className="text-xs text-primary-foreground/75">Demain à 9h00 — {customerName}</p>
        </div>
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-primary-foreground"
          style={{ pointerEvents: 'auto' }}
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
