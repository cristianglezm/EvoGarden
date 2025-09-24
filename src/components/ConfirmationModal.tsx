import React from 'react';

interface ConfirmationModalProps {
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
    onConfirm, 
    onCancel,
    title,
    message,
    confirmText = 'Confirm & Clear',
    cancelText = 'Cancel'
}) => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onCancel}>
        <div className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-primary-light">{title}</h3>
            <p className="text-secondary my-4">{message}</p>
            <div className="flex justify-end space-x-4">
                <button onClick={onCancel} className="px-4 py-2 bg-surface-hover hover:bg-border/20 text-primary-light font-semibold rounded-md transition-colors">{cancelText}</button>
                <button onClick={onConfirm} className="px-4 py-2 bg-accent-red/80 hover:bg-accent-red text-white font-semibold rounded-md transition-colors">{confirmText}</button>
            </div>
        </div>
    </div>
);
