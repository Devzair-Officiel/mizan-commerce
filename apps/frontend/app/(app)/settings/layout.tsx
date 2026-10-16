import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';
import { SettingsNavigation } from '@/components/settings/SettingsNavigation';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AccessGuard adminOnly>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <SettingsNavigation />
        <div className="@container/settings min-w-0" data-settings-content>{children}</div>
      </div>
    </AccessGuard>
  );
}
