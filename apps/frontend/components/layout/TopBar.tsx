'use client';

interface TopBarProps {
  title: string;
  action?: React.ReactNode;
}

export function TopBar({ title, action }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
      <h1 className="text-base font-semibold text-zinc-900">{title}</h1>
      {action && <div>{action}</div>}
    </header>
  );
}
