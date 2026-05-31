export type ToastKind = 'success' | 'error' | 'info';

export function appToast(message: string, kind: ToastKind = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, kind } }));
}
