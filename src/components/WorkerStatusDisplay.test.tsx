import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { WorkerStatusDisplay } from './WorkerStatusDisplay';
import type { TickSummary, WorkersSummary } from '../types';

const workers = (over: Partial<WorkersSummary> = {}): WorkersSummary => ({
    flowerWorkers: [
        { name: 'Flower worker 1', inFlight: 7, produced: 120, failed: 0, avgMs: 48.4 },
        { name: 'Flower worker 2', inFlight: 0, produced: 118, failed: 2, avgMs: null },
    ],
    speciesWorker: 'Species worker',
    species: { waiting: 3, answered: 80, dropped: 4, byStatus: { stored: 70, discovered: 3, failed: 1, skipped: 6 }, avgMs: 26.4 },
    produced: 238, failed: 2, flowersPerSecond: 3.44, seedsDiscarded: 5, seedsCancelled: 40, discardedAfterCancel: 3, queued: 12,
    ...over,
});
const summaryOf = (pending: number, w?: WorkersSummary) => ({ pendingFlowerRequests: pending, workers: w }) as unknown as TickSummary;
const environment = { hardwareConcurrency: 8, search: '?creationWorkers=2' };
const bar = () => screen.getByRole('button', { name: /pending|idle|no pending/i });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('WorkerStatusDisplay', () => {
    describe('without the numbers of the workers (a summary from before them)', () => {
        it('says what it said: the pending count, or none pending', () => {
            const { rerender } = render(<WorkerStatusDisplay summary={summaryOf(4)} environment={environment} />);
            expect(screen.getByText('Genetics Worker: 4 pending')).toBeInTheDocument();
            rerender(<WorkerStatusDisplay summary={null} environment={environment} />);
            expect(screen.getByText('No pending flowers')).toBeInTheDocument();
        });
    });

    describe('the bar', () => {
        it('has a cell for each flower worker with what it has in flight, and says it in words', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            expect(screen.getByText('Flower worker 1: 7 in flight')).toBeInTheDocument();
            expect(screen.getByText('Flower worker 2: 0 in flight')).toBeInTheDocument();
        });

        it('shows which workers are busy and which are idle', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            const cells = screen.getAllByTestId('worker-dot');
            expect(cells.map(c => c.getAttribute('data-state'))).toEqual(['busy', 'idle', 'busy']);
        });

        it('calls a worker with one request in flight busy', () => {
            render(<WorkerStatusDisplay summary={summaryOf(1, workers({ flowerWorkers: [{ name: 'Flower worker 1', inFlight: 1, produced: 0, failed: 0, avgMs: null }], speciesWorker: null }))} environment={environment} />);
            expect(screen.getByTestId('worker-dot')).toHaveAttribute('data-state', 'busy');
        });

        it('has a cell for the species with what waits, and the total pending at the end', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            expect(screen.getByText('Species worker: 3 waiting')).toBeInTheDocument();
            expect(screen.getByText('Genetics Worker: 7 pending')).toBeInTheDocument();
        });

        it('has no species cell when nobody does the species', () => {
            render(<WorkerStatusDisplay summary={summaryOf(0, workers({ speciesWorker: null }))} environment={environment} />);
            expect(screen.queryByText(/waiting/)).not.toBeInTheDocument();
            expect(screen.getByText('No pending flowers')).toBeInTheDocument();
        });

        it('says "Species work in Flower worker 1" when a flower worker does it', () => {
            render(<WorkerStatusDisplay summary={summaryOf(0, workers({ speciesWorker: 'Flower worker 1' }))} environment={environment} />);
            expect(screen.getByText('Species work in Flower worker 1: 3 waiting')).toBeInTheDocument();
        });
    });

    describe('the details', () => {
        const open = () => fireEvent.click(bar());
        const details = () => screen.getByRole('region', { name: 'Worker details' });

        it('are closed until the bar is clicked, and the bar says so', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            expect(screen.queryByRole('region', { name: 'Worker details' })).not.toBeInTheDocument();
            expect(bar()).toHaveAttribute('aria-expanded', 'false');
            open();
            expect(bar()).toHaveAttribute('aria-expanded', 'true');
            expect(details()).toBeInTheDocument();
        });

        it('close when the bar is clicked again', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            open(); open();
            expect(screen.queryByRole('region', { name: 'Worker details' })).not.toBeInTheDocument();
        });

        it('have a row for each flower worker with its numbers', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            open();
            const row1 = within(details()).getByRole('row', { name: /Flower worker 1/ });
            expect(within(row1).getAllByRole('cell').map(c => c.textContent)).toEqual(['Flower worker 1', '7', '120', '0', '48 ms']);
            const row2 = within(details()).getByRole('row', { name: /Flower worker 2/ });
            expect(within(row2).getAllByRole('cell').map(c => c.textContent)).toEqual(['Flower worker 2', '0', '118', '2', '–']);
        });

        it('have a row for the species worker', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            open();
            const row = within(details()).getByRole('row', { name: /Species worker/ });
            expect(within(row).getAllByRole('cell').map(c => c.textContent)).toEqual(['Species worker', '3', '80', '1', '26 ms']);
        });

        it('have a dash for the species until one was classified', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers({ species: { waiting: 0, dropped: 0, answered: 0, byStatus: {}, avgMs: null } }))} environment={environment} />);
            open();
            const row = within(details()).getByRole('row', { name: /Species worker/ });
            expect(within(row).getAllByRole('cell').map(c => c.textContent)).toEqual(['Species worker', '0', '0', '0', '–']);
        });

        it('give the totals and the species by status', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            open();
            expect(within(details()).getByText('Flowers produced: 238 (3.4 per second, last 10 s)')).toBeInTheDocument();
            expect(within(details()).getByText('Flowers waiting for a worker: 12')).toBeInTheDocument();
            expect(within(details()).getByText('Seeds discarded: 5')).toBeInTheDocument();
            expect(within(details()).getByText('Seeds: 40 cancelled, 5 flowers thrown away (3 after a cancel came too late, 2 with no cancel)')).toBeInTheDocument();
            expect(within(details()).getByText('Species: discovered 3, stored 70, skipped 6, failed 1')).toBeInTheDocument();
            expect(within(details()).getByText('Species dropped from the queue (too many waiting): 4')).toBeInTheDocument();
        });

        it('say how the workers were chosen', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            open();
            expect(within(details()).getByText('Setup: 8 cores, 2 flower workers (address), species worker on (automatic)')).toBeInTheDocument();
        });

        it('say the player chose the number of workers, when the address did not', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={{ hardwareConcurrency: 8, search: '', workers: 3 }} />);
            open();
            expect(within(details()).getByText('Setup: 8 cores, 2 flower workers (setting), species worker on (setting)')).toBeInTheDocument();
        });

        it('keep up with the numbers while they are open', () => {
            const { rerender } = render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            open();
            rerender(<WorkerStatusDisplay summary={summaryOf(2, workers({ seedsDiscarded: 9 }))} environment={environment} />);
            expect(within(details()).getByText('Seeds discarded: 9')).toBeInTheDocument();
        });

        it('close with Escape, and give the focus back to the bar', () => {
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            open();
            fireEvent.keyDown(document, { key: 'Escape' });
            expect(screen.queryByRole('region', { name: 'Worker details' })).not.toBeInTheDocument();
            expect(bar()).toHaveFocus();
        });

        it('close when the player clicks anywhere else, but not when they click inside', () => {
            render(<div><span>elsewhere</span><WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} /></div>);
            open();
            fireEvent.mouseDown(details());
            expect(details()).toBeInTheDocument();
            fireEvent.mouseDown(screen.getByText('elsewhere'));
            expect(screen.queryByRole('region', { name: 'Worker details' })).not.toBeInTheDocument();
        });

        it('say what will start before the workers have reported: the plan, the same as the one that starts them', () => {
            render(<WorkerStatusDisplay summary={summaryOf(0)} environment={{ hardwareConcurrency: 8, search: '', workers: null }} />);
            open();
            expect(within(details()).getByText('Setup: 8 cores, 3 flower workers (automatic), species worker on (automatic)')).toBeInTheDocument();
        });

        it('say the plan with the address and the setting in it, and with one worker, no species worker', () => {
            const { unmount } = render(<WorkerStatusDisplay summary={summaryOf(0)} environment={{ hardwareConcurrency: 8, search: '?creationWorkers=2', workers: 5 }} />);
            open();
            expect(within(details()).getByText('Setup: 8 cores, 2 flower workers (address), species worker on (setting)')).toBeInTheDocument();
            unmount();
            render(<WorkerStatusDisplay summary={summaryOf(0)} environment={{ hardwareConcurrency: 2, search: '', workers: null }} />);
            open();
            expect(within(details()).getByText('Setup: 2 cores, 1 flower worker (automatic), species worker off (automatic)')).toBeInTheDocument();
        });

        it('say the plan of the number of workers the player chose, not the one of the cores', () => {
            render(<WorkerStatusDisplay summary={summaryOf(0)} environment={{ hardwareConcurrency: 8, search: '', workers: 2 }} />);
            open();
            expect(within(details()).getByText('Setup: 8 cores, 1 flower worker (setting), species worker on (setting)')).toBeInTheDocument();
        });

        it('have no way to copy before the workers have reported: there is nothing to copy', () => {
            render(<WorkerStatusDisplay summary={summaryOf(0)} environment={environment} />);
            open();
            expect(within(details()).queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
        });

        it('say the bar has no numbers yet, rather than show an empty table', () => {
            render(<WorkerStatusDisplay summary={summaryOf(0)} environment={environment} />);
            open();
            expect(within(details()).getByText('The workers have not reported yet.')).toBeInTheDocument();
        });
    });

    describe('copying', () => {
        const withClipboard = (writeText: (text: string) => Promise<void>) => {
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        };

        it('puts the report in the clipboard and says so', async () => {
            const writeText = vi.fn().mockResolvedValue(undefined);
            withClipboard(writeText);
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            fireEvent.click(bar());
            fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
            await waitFor(() => expect(screen.getByRole('status', { name: 'Copy result' })).toHaveTextContent('Copied'));
            expect(writeText).toHaveBeenCalledTimes(1);
            expect(writeText.mock.calls[0][0]).toContain('Flower worker 1: 7 in flight, 120 produced, 0 failed, 48 ms per flower');
            expect(writeText.mock.calls[0][0]).toContain('Setup: 8 cores, 2 flower workers (address), species worker on (automatic)');
        });

        it('says it could not when the browser refuses', async () => {
            withClipboard(vi.fn().mockRejectedValue(new Error('denied')));
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            fireEvent.click(bar());
            fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
            await waitFor(() => expect(screen.getByRole('status', { name: 'Copy result' })).toHaveTextContent('Could not copy'));
        });

        it('says it could not when there is no clipboard', async () => {
            Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
            render(<WorkerStatusDisplay summary={summaryOf(7, workers())} environment={environment} />);
            fireEvent.click(bar());
            fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
            await waitFor(() => expect(screen.getByRole('status', { name: 'Copy result' })).toHaveTextContent('Could not copy'));
        });
    });
});
