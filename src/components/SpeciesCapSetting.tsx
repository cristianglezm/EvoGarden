import React, { useCallback, useEffect, useState } from 'react';
import type { SpeciesSource } from '../services/speciesSource';
import { DEFAULT_SPECIES_LIMITS } from '../lib/speciesRepository';
import { ConfirmationModal } from './ConfirmationModal';

/** Sized like Flower Detail: the player picks a size, not a number. */
export const SPECIES_CAP_SIZES = [
    { name: 'Small', cap: 25 },
    { name: 'Medium', cap: 50 },
    { name: 'Large', cap: 100 },
] as const;

export function capChoices(current: number): { label: string; cap: number }[] {
    const sizes = SPECIES_CAP_SIZES.map(({ name, cap }) => ({ label: `${name} (${cap})`, cap }));
    if (sizes.some(s => s.cap === current)) return sizes;
    // A value stored by an older version, or by hand, is shown rather than silently replaced.
    return [...sizes, { label: `Custom (${current})`, cap: current }].sort((a, b) => a.cap - b.cap);
}

interface SpeciesCapSettingProps {
    source: Pick<SpeciesSource, 'limits' | 'setCap'>;
}

/**
 * How many samples each species keeps. It takes effect at once (the flower worker reads it before
 * each job), so it has no Apply & Reset; lowering it lets go of samples, so that one asks first.
 */
export const SpeciesCapSetting: React.FC<SpeciesCapSettingProps> = ({ source }) => {
    const [cap, setCap] = useState(DEFAULT_SPECIES_LIMITS.cap);
    const [pendingCap, setPendingCap] = useState<number | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        try {
            setCap((await source.limits()).cap);
        } catch (error) {
            console.error('Species collection: could not read the cap.', error);
        }
    }, [source]);

    useEffect(() => {
        load();
    }, [load]);

    const apply = async (next: number) => {
        setPendingCap(null);
        setFailed(false);
        try {
            await source.setCap(next);
            setCap(next);
        } catch (error) {
            console.error('Species collection: could not set the cap.', error);
            setFailed(true);
        }
    };

    return (
        <div className="space-y-1">
            <label className="block" htmlFor="speciesCap">
                <span className="text-secondary text-sm">Species collection</span>
                <select
                    id="speciesCap"
                    value={cap}
                    onChange={e => {
                        const next = Number(e.target.value);
                        if (next < cap) setPendingCap(next);
                        else apply(next);
                    }}
                    className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white"
                >
                    {capChoices(cap).map(choice => <option key={choice.cap} value={choice.cap}>{choice.label}</option>)}
                </select>
            </label>
            <p className="text-xs text-secondary">Each species keeps up to {cap} samples for the field guide. It applies at once, no reset needed.</p>
            {failed && <p role="alert" className="text-sm text-accent-red">The cap could not be saved.</p>}
            {pendingCap !== null && (
                <ConfirmationModal
                    title="Keep fewer samples?"
                    message={`Keeping ${pendingCap} samples per species lets go the most typical ones of the species that have more. The flower that found each species and the holders of its records are kept. This cannot be undone.`}
                    confirmText="Lower it"
                    onConfirm={() => apply(pendingCap)}
                    onCancel={() => setPendingCap(null)}
                />
            )}
        </div>
    );
};
