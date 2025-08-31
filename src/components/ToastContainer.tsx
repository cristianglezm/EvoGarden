

import React from 'react';
import { useToastStore } from '../stores/toastStore';
import { Toast } from './Toast';

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      aria-live="assertive"
      className="fixed top-20 right-4 flex flex-col items-end space-y-4 pointer-events-none z-50"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
};
