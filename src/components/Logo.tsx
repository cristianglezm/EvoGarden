import React from 'react';

export const Logo: React.FC = () => {
    return (
        <div className="flex flex-col items-center flex-shrink-0">
            <img src="/EvoGarden-logo.png" title="EvoGarden" alt="EvoGarden Logo" className="h-18" />
            <p className="text-xs text-secondary/70 font-mono -mt-1" aria-label={`Version ${import.meta.env.VITE_APP_VERSION}`}>
                v{import.meta.env.VITE_APP_VERSION}
            </p>
        </div>
    );
};
