'use client';

import { useEffect, useState } from 'react';

type Item = { id: number; message: string; kind: 'success' | 'error' | 'info' };

export function ToastHub() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const onToast = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      const item: Item = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        message: String(detail.message || ''),
        kind: (detail.kind || 'info') as Item['kind']
      };
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, 3200);
    };
    window.addEventListener('app:toast', onToast as EventListener);
    return () => window.removeEventListener('app:toast', onToast as EventListener);
  }, []);

  return (
    <div className="toast-stack">
      {items.map((item) => (
        <div key={item.id} className={`toast-item toast-${item.kind}`}>
          {item.message}
        </div>
      ))}
    </div>
  );
}
