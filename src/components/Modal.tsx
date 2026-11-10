import React from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from './icons';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    /** `screen` for content that needs room, like the field guide: most of the screen, with a margin. */
    size?: 'md' | 'screen';
}

// `screen` is 90% of the width and height of the window, so 5% is left on each side.
const PANELS = {
    md: 'w-full max-w-3xl h-full max-h-[80vh]',
    screen: 'w-[90vw] h-[90vh]',
};

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
    if (!isOpen) return null;

    // Rendered in the body, not where it is used: a panel that slides in with a CSS transform becomes the
    // containing block of everything `fixed` inside it, so a modal opened from a panel was as big as the panel.
    return createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose} aria-modal="true" role="dialog">
            <div className={`bg-surface border border-border rounded-lg shadow-xl ${PANELS[size]} flex flex-col`} onClick={e => e.stopPropagation()}>
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
                <main className="grow h-0">{children}</main>
            </div>
        </div>,
        document.body
    );
};
