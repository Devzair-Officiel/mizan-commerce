let checker: (() => boolean) | null = null;

export function registerDirtyChecker(fn: () => boolean): void {
  checker = fn;
}

export function unregisterDirtyChecker(): void {
  checker = null;
}

export function confirmLeave(message: string): boolean {
  if (!checker || !checker()) return true;
  return window.confirm(message);
}
