import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SpeciesClearSetting } from './SpeciesClearSetting';
import { createGuideHarness } from '../test/guideHarness';
import { db } from '../services/db';

let h: Awaited<ReturnType<typeof createGuideHarness>>;

beforeAll(async () => {
    h = await createGuideHarness();
}, 60_000);

beforeEach(async () => {
    await h.reset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

const clear = () => screen.findByRole('button', { name: 'Clear species collection' });
const confirm = async () => fireEvent.click(await screen.findByRole('button', { name: 'Clear species' }));

describe('SpeciesClearSetting', () => {
    it('asks first, and says what is lost and what is not', async () => {
        render(<SpeciesClearSetting source={h.source} />);
        fireEvent.click(await clear());
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
        expect(within(dialog).getByText(/Seed Bank, its champions/)).toBeInTheDocument();
        expect(await db.speciesSamples.count()).toBe(0);
    });

    it('clears the samples and the genomes once confirmed, and says so', async () => {
        await h.offer('genome-a', 3, 2, { image: 'png' });
        render(<SpeciesClearSetting source={h.source} />);
        fireEvent.click(await clear());
        await confirm();
        await waitFor(async () => expect(await db.speciesSamples.count()).toBe(0));
        expect(await db.speciesGenomes.count()).toBe(0);
        expect(await screen.findByRole('status')).toHaveTextContent('The species collection is empty.');
    });

    it('keeps everything when the player cancels', async () => {
        await h.offer('genome-a', 3, 2);
        render(<SpeciesClearSetting source={h.source} />);
        fireEvent.click(await clear());
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('button', { name: 'Clear species' })).not.toBeInTheDocument();
        expect(await db.speciesSamples.count()).toBe(1);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does not touch the seed bank', async () => {
        await db.seedBank.put({ category: 'longestLived', genome: 'g', value: 3, imageData: 'png', sex: 'both' });
        render(<SpeciesClearSetting source={h.source} />);
        fireEvent.click(await clear());
        await confirm();
        expect(await screen.findByRole('status')).toBeInTheDocument();
        expect(await db.seedBank.count()).toBe(1);
    });

    it('says when it could not, and does not say it cleared', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const failing = { ...h.source, clear: vi.fn().mockRejectedValue(new Error('closed')) };
        render(<SpeciesClearSetting source={failing} />);
        fireEvent.click(await clear());
        await confirm();
        expect(await screen.findByRole('alert')).toHaveTextContent('could not be cleared');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('forgets a failure the next time it tries', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const clearFn = vi.fn().mockRejectedValueOnce(new Error('closed')).mockResolvedValue(undefined);
        render(<SpeciesClearSetting source={{ ...h.source, clear: clearFn }} />);
        fireEvent.click(await clear());
        await confirm();
        await screen.findByRole('alert');
        fireEvent.click(await clear());
        await confirm();
        expect(await screen.findByRole('status')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
