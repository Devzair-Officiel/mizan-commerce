import { type ReactNode } from 'react';

export function CountersGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}
    >
      {children}
    </div>
  );
}
