import React, { useState } from 'react';
import { ChevronDownIcon } from './icons';

interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="pt-3 border-t border-border/50">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full text-left py-2 cursor-pointer"
                aria-expanded={isOpen}
            >
                <h3 className="text-lg font-semibold text-primary-light/80">{title}</h3>
                <ChevronDownIcon className={`w-5 h-5 text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="mt-2 space-y-3">{children}</div>}
        </div>
    );
};
