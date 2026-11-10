import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { FieldGuideHost } from './FieldGuideHost';
import { flowerService } from '../services/flowerService';
import { db } from '../services/db';
import { createGuideHarness, stubCanvas } from '../test/guideHarness';
import { speciesName } from '../lib/species';

vi.mock('./Flower3DViewer', () => ({ Flower3DViewer: () => <div data-testid="viewer-3d" /> }));
vi.mock('../services/flowerService', () => ({ flowerService: { draw3DFlower: vi.fn() } }));

let h: Awaited<ReturnType<typeof createGuideHarness>>;
const STOUT_LOTUS = speciesName(3, 2, 12);

beforeAll(async () => {
    h = await createGuideHarness();
}, 60_000);

beforeEach(async () => {
    await h.reset();
    stubCanvas();
    vi.mocked(flowerService.draw3DFlower).mockResolvedValue('gltf-text');
});

afterEach(() => {
    vi.restoreAllMocks();
});

const champion = (category: 'longestLived' | 'mostToxic' | 'mostHealing', genome: string, value: number) => ({
    category,
    genome,
    value,
    imageData: `png-${category}`,
    sex: 'female' as const,
});

function host(props: Partial<React.ComponentProps<typeof FieldGuideHost>> = {}) {
    return render(<FieldGuideHost isOpen cell={null} onClose={vi.fn()} isRunning setIsRunning={vi.fn()} source={h.source} {...props} />);
}

describe('FieldGuideHost', () => {
    it('shows nothing while it is closed, and reads nothing', async () => {
        const toArray = vi.spyOn(db.seedBank, 'toArray');
        host({ isOpen: false });
        expect(screen.queryByRole('heading', { name: 'Field Guide' })).not.toBeInTheDocument();
        expect(toArray).not.toHaveBeenCalled();
    });

    it('shows the guide when it is open, and says it was closed when the player closes it', async () => {
        const onClose = vi.fn();
        host({ onClose });
        expect(await screen.findByRole('group', { name: /Species map/ })).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('opens at the species it was asked for', async () => {
        await h.record('genome-of-the-champion', 3, 2, { age: 300, image: 'png' });
        host({ cell: '3,2' });
        expect(await screen.findByRole('region', { name: STOUT_LOTUS })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: new RegExp(`^${STOUT_LOTUS}, discovered`) })).toHaveAttribute('aria-pressed', 'true');
    });

    it('opens at no species when it is asked for none', async () => {
        await h.record('genome-of-the-champion', 3, 2, { age: 300, image: 'png' });
        host({ cell: null });
        await screen.findByRole('group', { name: /Species map/ });
        expect(screen.queryByRole('region', { name: STOUT_LOTUS })).not.toBeInTheDocument();
    });

    it('marks the species a champion belongs to, with the champions as they are when it opens', async () => {
        await h.record('genome-of-the-champion', 3, 2, { age: 300, image: 'png' });
        const { rerender } = host({ isOpen: false });
        await db.seedBank.put(champion('longestLived', 'genome-of-the-champion', 300));
        rerender(<FieldGuideHost isOpen cell={null} onClose={vi.fn()} isRunning setIsRunning={vi.fn()} source={h.source} />);
        expect(await screen.findByRole('button', { name: new RegExp(`^${STOUT_LOTUS}, discovered, home of a champion`) })).toBeInTheDocument();
    });

    it('reads the champions again each time it opens', async () => {
        await h.record('genome-of-the-champion', 3, 2, { age: 300, image: 'png' });
        const { rerender } = host();
        await screen.findByRole('group', { name: /Species map/ });
        rerender(<FieldGuideHost isOpen={false} cell={null} onClose={vi.fn()} isRunning setIsRunning={vi.fn()} source={h.source} />);
        await db.seedBank.put(champion('longestLived', 'genome-of-the-champion', 300));
        rerender(<FieldGuideHost isOpen cell={null} onClose={vi.fn()} isRunning setIsRunning={vi.fn()} source={h.source} />);
        expect(await screen.findByRole('button', { name: new RegExp(`^${STOUT_LOTUS}, discovered, home of a champion`) })).toBeInTheDocument();
    });

    it('still shows the guide when the champions cannot be read', async () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(db.seedBank, 'toArray').mockRejectedValue(new Error('closed'));
        host();
        expect(await screen.findByRole('group', { name: /Species map/ })).toBeInTheDocument();
        quiet.mockRestore();
    });

    it('gives the guide the number of flowers that wait to be classified', async () => {
        host({ waiting: 7 });
        expect(await screen.findByText('7 flowers are waiting to be classified.')).toBeInTheDocument();
    });

    describe('from the records of a species', () => {
        async function openRecord(props: Partial<React.ComponentProps<typeof FieldGuideHost>> = {}) {
            await h.record('genome-of-the-record', 3, 2, { age: 120, image: 'png', sex: 'male' });
            const result = host(props);
            await screen.findByRole('group', { name: /Species map/ });
            fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${STOUT_LOTUS},`) }));
            const item = within(await screen.findByRole('region', { name: STOUT_LOTUS })).getAllByRole('listitem')[0];
            return { ...result, item };
        }

        it('plants a seed: the guide is closed, so the garden can be clicked, and the planting mode starts', async () => {
            const onPlant = vi.fn();
            const onClose = vi.fn();
            const { item } = await openRecord({ onPlant, onClose });
            fireEvent.click(within(item).getByRole('button', { name: /Plant/ }));
            await waitFor(() => expect(onPlant).toHaveBeenCalledExactlyOnceWith('genome-of-the-record', 'male'));
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('has nothing to plant with when it cannot start planting', async () => {
            const { item } = await openRecord();
            expect(within(item).queryByRole('button', { name: /Plant/ })).not.toBeInTheDocument();
        });

        it('shows the flower in 3D over the guide, and pauses the garden as it does for a champion', async () => {
            const setIsRunning = vi.fn();
            const { item } = await openRecord({ setIsRunning });
            fireEvent.click(within(item).getByRole('button', { name: /View 3D/ }));
            await waitFor(() => expect(flowerService.draw3DFlower).toHaveBeenCalledExactlyOnceWith('genome-of-the-record', 'male'));
            expect(setIsRunning).toHaveBeenCalledWith(false);
            expect(await screen.findByTestId('viewer-3d')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Field Guide' })).toBeInTheDocument();
        });

        it('downloads the genome as a species file, not as a champion', async () => {
            const clicked: HTMLAnchorElement[] = [];
            vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
                clicked.push(this);
            });
            const { item } = await openRecord();
            fireEvent.click(within(item).getByRole('button', { name: /Download/ }));
            await waitFor(() => expect(clicked).toHaveLength(1));
            expect(clicked[0].download).toBe('species_3-2_longestLived.json');
            expect(decodeURIComponent(clicked[0].href)).toContain('genome-of-the-record');
        });
    });
});
