import React, { useState } from 'react';
import type { SpeciesSource } from '../services/speciesSource';
import { ConfirmationModal } from './ConfirmationModal';
import { Trash2Icon } from './icons';

interface SpeciesClearSettingProps {
    source: Pick<SpeciesSource, 'clear'>;
}

/**
 * Starts the species collection over, for a run with no species found. The Seed Bank has its own Clear and is not
 * touched. Flowers already in the garden are not asked for again: species are found as new flowers mature.
 */
export const SpeciesClearSetting: React.FC<SpeciesClearSettingProps> = ({ source }) => {
    const [asking, setAsking] = useState(false);
    const [state, setState] = useState<'idle' | 'cleared' | 'failed'>('idle');

    const clear = async () => {
        setAsking(false);
        try {
            await source.clear();
            setState('cleared');
        } catch (error) {
            console.error('Species collection: could not clear it.', error);
            setState('failed');
        }
    };

    return (
        <div className="space-y-1">
            <button
                onClick={() => { setState('idle'); setAsking(true); }}
                className="flex items-center px-3 py-1.5 bg-accent-red/20 hover:bg-accent-red/40 text-accent-red font-semibold rounded-md transition-colors text-sm"
                title="Remove every species found and every sample kept"
            >
                <Trash2Icon className="w-4 h-4 mr-2" />
                Clear species collection
            </button>
            <p className="text-xs text-secondary">Starts the field guide over. The Seed Bank has its own Clear.</p>
            {state === 'cleared' && <p role="status" className="text-sm text-accent-green">The species collection is empty.</p>}
            {state === 'failed' && <p role="alert" className="text-sm text-accent-red">The species collection could not be cleared.</p>}
            {asking && (
                <ConfirmationModal
                    title="Clear the species collection?"
                    message="This removes every species found and every sample kept, with their records. It cannot be undone. The Seed Bank, its champions and the cap per species are not touched; species will be found again as new flowers mature."
                    confirmText="Clear species"
                    onConfirm={clear}
                    onCancel={() => setAsking(false)}
                />
            )}
        </div>
    );
};
