import React from 'react';
import { XIcon } from './icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-xl font-bold text-secondary">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-secondary hover:text-primary hover:bg-surface-hover rounded-full transition-colors"
            aria-label="Close modal"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </header>
        <main className="grow h-0">
          {children}
        </main>
      </div>
    </div>
  );
};
