import { History } from 'lucide-react';
import { useOrderActivity } from '@/lib/hooks/useOrders';
import { FULL_FMT, describeEvent, relativeTime } from './constants';

interface OrderActivityTimelineProps {
  orderId: string;
}

export function OrderActivityTimeline({ orderId }: OrderActivityTimelineProps) {
  const { data } = useOrderActivity(orderId);
  if (!data || data.events.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-zinc-100">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <History size={14} />
          Activité
        </h2>
      </div>
      <ol className="divide-y divide-zinc-100">
        {data.events.map((event) => {
          const disp = describeEvent(event);
          return (
            <li key={event.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${disp.iconBg}`}>
                {disp.icon}
              </span>
              <div className="flex flex-1 flex-col min-w-0 gap-0.5">
                <p className="text-sm font-medium text-zinc-900">{disp.title}</p>
                {disp.body && (
                  <p className="text-xs text-zinc-500 whitespace-pre-wrap wrap-break-word">{disp.body}</p>
                )}
                <p className="text-xs text-zinc-400">
                  {event.actor_name ? `${event.actor_name} · ` : ''}
                  <span title={FULL_FMT.format(new Date(event.occurred_at))}>
                    {relativeTime(event.occurred_at)}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
