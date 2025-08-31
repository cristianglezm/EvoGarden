import React, { useState } from 'react';
import { ChallengesPanel } from './ChallengesPanel';
import { ChartsPanel } from './ChartsPanel';
import { XIcon, LineChartIcon, TrophyIcon } from './icons';

interface DataPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

type ActiveTab = 'challenges' | 'analytics';

export const DataPanel: React.FC<DataPanelProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('challenges');

    return (
        <>
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            ></div>

            {/* Panel Content */}
            <aside className={`fixed top-0 left-0 h-full bg-surface z-40 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} w-full max-w-sm`}>
                <div className="h-full flex flex-col">
                    <header className="flex items-center justify-between p-2 bg-background text-primary-light">
                        <h2 className="text-xl font-bold ml-2">Challenges & Analytics</h2>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-black/20 rounded-full"
                            aria-label="Close data panel"
                        >
                            <XIcon className="w-6 h-6" />
                        </button>
                    </header>
                    <div className="border-b border-border/50">
                        <nav className="flex space-x-2 p-2" aria-label="Tabs">
                            <button
                                onClick={() => setActiveTab('challenges')}
                                className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md ${activeTab === 'challenges' ? 'bg-accent-green/50 text-white' : 'text-secondary hover:bg-surface-hover/50'} cursor-pointer`}
                                role="tab"
                                aria-selected={activeTab === 'challenges'}
                            >
                                <TrophyIcon className="w-5 h-5 mr-2" />
                                Challenges
                            </button>
                            <button
                                onClick={() => setActiveTab('analytics')}
                                className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md ${activeTab === 'analytics' ? 'bg-accent-green/50 text-white' : 'text-secondary hover:bg-surface-hover/50'} cursor-pointer`}
                                role="tab"
                                aria-selected={activeTab === 'analytics'}
                            >
                                <LineChartIcon className="w-5 h-5 mr-2" />
                                Analytics
                            </button>
                        </nav>
                    </div>
                    <div className="grow overflow-y-auto">
                        {activeTab === 'challenges' ? <ChallengesPanel /> : <ChartsPanel />}
                    </div>
                </div>
            </aside>
        </>
    );
};
