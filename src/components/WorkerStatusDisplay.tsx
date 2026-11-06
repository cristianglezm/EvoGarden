import React, { useEffect, useId, useRef, useState } from 'react';
import type { TickSummary, WorkersSummary } from '../types';
import { LoaderIcon, CheckIcon } from './icons';
import { planWorkers, workerPlanSource, type WorkerPlan } from '../lib/workerPlan';
import { readWorkerSetting } from '../lib/workerSetting';
import { describeWorkers, formatMs, plannedSetupLine, seedsLine, setupLine, speciesLabel, speciesStatusLine, type WorkerSetup } from '../lib/workerReport';

export interface WorkerEnvironment {
    hardwareConcurrency?: number;
    search?: string;
    /** the number of workers the player chose, null for automatic */
    workers?: number | null;
}

interface WorkerStatusDisplayProps {
    summary: TickSummary | null;
    /** where the cores and the address come from: the browser, unless a test says otherwise */
    environment?: WorkerEnvironment;
}

const browserEnvironment = (): WorkerEnvironment => ({
    hardwareConcurrency: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
    search: typeof window === 'undefined' ? '' : window.location.search,
    workers: readWorkerSetting(typeof window === 'undefined' ? undefined : browserStorage()),
});

const browserStorage = (): Storage | undefined => {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
};

const Dot: React.FC<{ busy: boolean }> = ({ busy }) => (
    <span
        data-testid="worker-dot"
        data-state={busy ? 'busy' : 'idle'}
        aria-hidden="true"
        className={`inline-block w-2.5 h-2.5 rounded-full ${busy ? 'bg-accent-yellow motion-safe:animate-pulse' : 'bg-surface-hover border border-secondary'}`}
    />
);

const Cell: React.FC<{ words: string; short: string; busy: boolean }> = ({ words, short, busy }) => (
    <span className="inline-flex items-center gap-1" title={words}>
        <Dot busy={busy} />
        <span aria-hidden="true">{short}</span>
        <span className="sr-only">{words}</span>
    </span>
);

const WorkerDetails: React.FC<{ id: string; workers: WorkersSummary | undefined; setup: WorkerSetup; plan: WorkerPlan }> = ({ id, workers, setup, plan }) => {
    const [copied, setCopied] = useState('');

    const copy = async () => {
        if (!workers) return;
        try {
            // without a clipboard (an insecure page) this throws too, and says the same
            await navigator.clipboard.writeText(describeWorkers(workers, setup));
            setCopied('Copied');
        } catch {
            setCopied('Could not copy');
        }
    };

    const label = workers ? speciesLabel(workers.speciesWorker) : null;
    return (
        <section
            id={id}
            role="region"
            aria-label="Worker details"
            className="absolute left-0 top-full mt-1 z-30 w-max max-w-[90vw] bg-surface border border-surface-hover rounded-md shadow-lg p-3 text-xs text-secondary font-mono space-y-2"
        >
            {!workers ? (
                <>
                    <p>The workers have not reported yet.</p>
                    <p>Setup: {plannedSetupLine(plan, setup)}</p>
                </>
            ) : (
                <>
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-primary-light">
                                <th scope="col" className="pr-3 font-semibold">Worker</th>
                                <th scope="col" className="pr-3 font-semibold">In flight (waiting)</th>
                                <th scope="col" className="pr-3 font-semibold">Produced (answered)</th>
                                <th scope="col" className="pr-3 font-semibold">Failed</th>
                                <th scope="col" className="font-semibold">Per flower</th>
                            </tr>
                        </thead>
                        <tbody>
                            {workers.flowerWorkers.map(w => (
                                <tr key={w.name}>
                                    <td className="pr-3">{w.name}</td>
                                    <td className="pr-3">{w.inFlight}</td>
                                    <td className="pr-3">{w.produced}</td>
                                    <td className="pr-3">{w.failed}</td>
                                    <td>{formatMs(w.avgMs)}</td>
                                </tr>
                            ))}
                            {label && (
                                <tr>
                                    <td className="pr-3">{label}</td>
                                    <td className="pr-3">{workers.species.waiting}</td>
                                    <td className="pr-3">{workers.species.answered}</td>
                                    <td className="pr-3">{workers.species.byStatus.failed ?? 0}</td>
                                    <td>{formatMs(workers.species.avgMs)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <p>Flowers produced: {workers.produced} ({workers.flowersPerSecond.toFixed(1)} per second, last 10 s)</p>
                    <p>Flowers waiting for a worker: {workers.queued}</p>
                    <p>Seeds discarded: {workers.seedsDiscarded}</p>
                    <p>{seedsLine(workers)}</p>
                    <p>Species: {speciesStatusLine(workers.species.byStatus)}</p>
                    <p>Species dropped from the queue (too many waiting): {workers.species.dropped}</p>
                    <p>Setup: {setupLine(workers, setup)}</p>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={copy} className="px-2 py-1 rounded bg-surface-hover text-primary-light hover:bg-background">Copy</button>
                        <span role="status" aria-label="Copy result">{copied}</span>
                    </div>
                </>
            )}
        </section>
    );
};

export const WorkerStatusDisplay: React.FC<WorkerStatusDisplayProps> = ({ summary, environment }) => {
    const [open, setOpen] = useState(false);
    const wrapper = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const detailsId = useId();

    const pendingRequests = summary?.pendingFlowerRequests ?? 0;
    const hasPendingRequests = pendingRequests > 0;
    const workers = summary?.workers;

    const { hardwareConcurrency, search = '', workers: chosenWorkers } = environment ?? browserEnvironment();
    const setup: WorkerSetup = { hardwareConcurrency, ...workerPlanSource(search, chosenWorkers) };
    const plan = planWorkers({ hardwareConcurrency, search, workers: chosenWorkers });

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            setOpen(false);
            button.current?.focus();
        };
        const onPointer = (e: MouseEvent) => {
            if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onPointer);
        };
    }, [open]);

    const speciesName = !workers?.speciesWorker ? null : workers.speciesWorker === 'Species worker' ? 'Species worker' : `Species work in ${workers.speciesWorker}`;

    return (
        <div ref={wrapper} className="relative">
            <button
                ref={button}
                type="button"
                aria-expanded={open}
                aria-controls={open ? detailsId : undefined}
                onClick={() => setOpen(o => !o)}
                className="bg-background px-3 py-1.5 rounded-md text-xs text-secondary font-mono flex items-center gap-2 hover:bg-surface-hover"
                title={hasPendingRequests ? `${pendingRequests} genetics tasks are queued for processing.` : "Genetics worker is idle."}
            >
                {workers && (
                    <span className="flex items-center gap-2">
                        {workers.flowerWorkers.map(w => (
                            <Cell key={w.name} busy={w.inFlight > 0} short={String(w.inFlight)} words={`${w.name}: ${w.inFlight} in flight`} />
                        ))}
                        {speciesName && (
                            <Cell busy={workers.species.waiting > 0} short={`sp ${workers.species.waiting}`} words={`${speciesName}: ${workers.species.waiting} waiting`} />
                        )}
                    </span>
                )}
                {hasPendingRequests ? (
                    <>
                        <LoaderIcon className="w-4 h-4 text-accent-yellow animate-spin motion-reduce:animate-none" />
                        <span>Genetics Worker: {pendingRequests} pending</span>
                    </>
                ) : (
                    <>
                        <CheckIcon className="w-4 h-4 text-accent-green" />
                        <span>No pending flowers</span>
                    </>
                )}
            </button>
            {open && <WorkerDetails id={detailsId} workers={workers} setup={setup} plan={plan} />}
        </div>
    );
};
