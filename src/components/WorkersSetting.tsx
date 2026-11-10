import React, { useState } from 'react';
import { automaticWorkers, MAX_WORKERS, readWorkerSetting, writeWorkerSetting } from '../lib/workerSetting';

interface WorkersSettingProps {
    /** where the number of cores and the saved choice come from: the browser, unless a test says otherwise */
    environment?: { hardwareConcurrency?: number };
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

const browserStorage = (): Storage | undefined => {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
};

const describeWorkers = (n: number) => `${n} worker${n === 1 ? '' : 's'}`;

/**
 * How many workers the game uses. They are created when the page loads, so a choice is kept and applies the
 * next time: it is not a reason to restart a game the player may not have saved.
 */
export const WorkersSetting: React.FC<WorkersSettingProps> = ({ environment, storage }) => {
    const store = storage ?? browserStorage();
    const cores = environment ? environment.hardwareConcurrency : typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
    const automatic = automaticWorkers(cores);
    const [chosen, setChosen] = useState<number | null>(() => readWorkerSetting(store));
    const [result, setResult] = useState('');

    const choose = (value: string) => {
        const next = value === 'auto' ? null : Number(value);
        if (writeWorkerSetting(store, next)) {
            setChosen(next);
            setResult(`${describeWorkers(next ?? automatic)} will be used when the page is loaded again.`);
        } else {
            setResult('The choice could not be saved.');
        }
    };

    return (
        <div className="space-y-1">
            <label className="block" htmlFor="workersSetting">
                <span className="text-secondary text-sm">Workers</span>
                <select
                    id="workersSetting"
                    value={chosen === null ? 'auto' : String(chosen)}
                    onChange={e => choose(e.target.value)}
                    className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white"
                >
                    <option value="auto">Automatic ({automatic})</option>
                    {Array.from({ length: MAX_WORKERS }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
            </label>
            <p className="text-xs text-secondary">
                Workers make the flowers and classify the species off the main thread. With two or more, one only classifies the species, the others make
                flowers and classify when they have none to make. More is faster until the processor is full.
            </p>
            <p role="status" aria-label="Workers result" className="text-xs text-secondary">
                {result}
            </p>
        </div>
    );
};
