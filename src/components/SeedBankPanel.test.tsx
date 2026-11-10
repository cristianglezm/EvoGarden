import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SeedBankPanel } from './SeedBankPanel';
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

const champion = (category: 'longestLived' | 'mostToxic' | 'mostHealing', genome: string, value: number) =>
    ({ category, genome, value, imageData: `png-${category}`, sex: 'female' as const });

function panel(props: Partial<React.ComponentProps<typeof SeedBankPanel>> = {}) {
    return render(<SeedBankPanel isRunning setIsRunning={vi.fn()} source={h.source} {...props} />);
}

describe('SeedBankPanel', () => {
    it('keeps showing the champions, without a species while the collection does not have them', async () => {
        await db.seedBank.put(champion('longestLived', 'unknown-genome', 300));
        panel();
        expect(await screen.findByText('300 ticks')).toBeInTheDocument();
        expect(screen.queryByText('View in field guide')).not.toBeInTheDocument();
    });

    it('names the species of a champion that the collection has', async () => {
        await db.seedBank.put(champion('longestLived', 'genome-of-the-champion', 300));
        await h.record('genome-of-the-champion', 3, 2, { age: 300, image: 'png' });
        panel({ onOpenGuide: vi.fn() });
        expect(await screen.findByText(STOUT_LOTUS)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View in field guide' })).toBeInTheDocument();
    });

    it('has no field guide button of its own: the guide is in the main menu', async () => {
        panel({ onOpenGuide: vi.fn() });
        await screen.findByText(/Champions are saved here/);
        expect(screen.queryByRole('button', { name: /^Field Guide/ })).not.toBeInTheDocument();
    });

    it('opens the field guide at the species of a champion', async () => {
        await db.seedBank.put(champion('longestLived', 'genome-of-the-champion', 300));
        await h.record('genome-of-the-champion', 3, 2, { age: 300, image: 'png' });
        const onOpenGuide = vi.fn();
        panel({ onOpenGuide });
        fireEvent.click(await screen.findByRole('button', { name: 'View in field guide' }));
        expect(onOpenGuide).toHaveBeenCalledExactlyOnceWith('3,2');
    });

    it('has no way to the field guide when it was not given one', async () => {
        await db.seedBank.put(champion('longestLived', 'genome-of-the-champion', 300));
        await h.record('genome-of-the-champion', 3, 2, { age: 300, image: 'png' });
        panel();
        await screen.findByText(STOUT_LOTUS);
        expect(screen.queryByRole('button', { name: /Field Guide/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'View in field guide' })).not.toBeInTheDocument();
    });

    it('shows a champion in 3D, and pauses the garden while it does', async () => {
        await db.seedBank.put(champion('longestLived', 'genome-of-the-champion', 300));
        const setIsRunning = vi.fn();
        panel({ setIsRunning });
        fireEvent.click(await screen.findByRole('button', { name: /3D/ }));
        await waitFor(() => expect(flowerService.draw3DFlower).toHaveBeenCalledExactlyOnceWith('genome-of-the-champion', 'female'));
        expect(setIsRunning).toHaveBeenCalledWith(false);
        expect(await screen.findByTestId('viewer-3d')).toBeInTheDocument();
    });

    it('clearing the seed bank leaves the species collection as it is', async () => {
        await db.seedBank.put(champion('longestLived', 'genome-of-the-champion', 300));
        await h.record('genome-of-the-champion', 3, 2, { age: 300, image: 'png' });
        panel();
        fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Confirm & Clear' }));
        await waitFor(async () => expect(await db.seedBank.count()).toBe(0));
        // the panel reloads after the clear: let it finish before the test does
        expect(await screen.findByText('The Seed Bank is empty.')).toBeInTheDocument();
        expect(await db.speciesSamples.count()).toBe(1);
    });
});
