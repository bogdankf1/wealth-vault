/**
 * Simple toast hook - placeholder for now
 * You can replace this with a proper toast library like sonner or react-hot-toast
 */
import { useState, useCallback } from 'react';

interface ToastOptions {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastOptions[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    // Simple console logging for now
    console.log(`[Toast ${options.variant || 'default'}]:`, options.title, options.description);

    // You can implement actual toast UI here or integrate with a toast library
    setToasts((prev) => [...prev, options]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 3000);
  }, []);

  return { toast, toasts };
}
