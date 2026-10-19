import { Check, Clock3, Package } from 'lucide-react';

const ACTIVITIES = [
  { label: 'Commande #009', status: 'À préparer', pending: true, Icon: Package },
  { label: 'Commande #006', status: 'Terminée', pending: false, Icon: Check },
  { label: 'Rappel du jour', status: 'À voir', pending: true, Icon: Clock3 },
];

export function HowDashboardPreview() {
  return (
    <div className="how-preview how-preview--dashboard" aria-hidden="true">
      <div className="how-window">
        <div className="how-window-header">
          <span className="how-window-title">À faire aujourd&apos;hui</span>
          <span className="how-window-meta">Vue d&apos;ensemble</span>
        </div>
        <dl className="how-metrics">
          <div>
            <dt>Commandes à préparer</dt>
            <dd>8<span>À traiter</span></dd>
          </div>
          <div>
            <dt>Stock faible</dt>
            <dd>5<span>À réassortir</span></dd>
          </div>
        </dl>
        <ul className="how-activity-list">
          {ACTIVITIES.map(({ label, status, pending, Icon }) => (
            <li key={label}>
              <span className="how-activity-icon"><Icon size={13} strokeWidth={2} /></span>
              <span className="how-activity-label">{label}</span>
              <span className={`how-status${pending ? ' how-status--pending' : ''}`}>{status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
