import React, { useEffect, useState } from 'react';
import { useToastStore } from '../stores/toastStore';
import type { ToastMessage } from '../types';
import { InfoIcon, XIcon } from './icons';

interface ToastProps {
  toast: ToastMessage;
}

const TOAST_TIMEOUT = 3000; // 3 seconds

export const Toast: React.FC<ToastProps> = ({ toast }) => {
  const removeToast = useToastStore((state) => state.removeToast);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, TOAST_TIMEOUT);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    // Allow time for exit animation before removing from store
    setTimeout(() => removeToast(toast.id), 300);
  };

  const iconColorClass = {
    info: 'text-blue-300',
    success: 'text-green-300',
    error: 'text-red-300',
  }[toast.type];

  return (
    <div
      className={`flex items-start w-full max-w-sm p-4 text-primary bg-surface/80 backdrop-blur-md rounded-lg shadow-lg border border-border transition-all duration-300 ease-in-out ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}`}
      role="alert"
    >
      <div className={`inline-flex items-center justify-center shrink-0 w-8 h-8 ${iconColorClass}`}>
        <InfoIcon className="w-6 h-6" />
        <span className="sr-only">{toast.type} icon</span>
      </div>
      <div className="ml-3 text-sm font-normal">{toast.message}</div>
      <button
        type="button"
        className="ml-auto -mx-1.5 -my-1.5 bg-transparent text-secondary hover:text-primary rounded-lg p-1.5 inline-flex h-8 w-8 transition-colors"
        aria-label="Close"
        onClick={handleClose}
      >
        <span className="sr-only">Close</span>
        <XIcon className="w-5 h-5" />
      </button>
    </div>
  );
};
