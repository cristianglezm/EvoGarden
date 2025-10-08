import React from 'react';
import { LogoIcon } from './icons';

export const Logo: React.FC = () => {
    return (
        <div className="flex items-center space-x-3 flex-shrink-0 pt-2">
            <LogoIcon className="h-8 w-8 text-tertiary" />
            <h1 className="text-2xl font-bold tracking-wider text-tertiary">Evo<span className="text-accent">Garden</span></h1>
        </div>
    );
};
