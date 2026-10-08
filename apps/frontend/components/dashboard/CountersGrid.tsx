import { type ReactNode } from 'react';

export function CountersGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {children}
    </div>
  );
}
