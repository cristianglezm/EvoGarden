import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SpeciesCapSetting } from './SpeciesCapSetting';
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

const cap = () => screen.findByRole('combobox', { name: /Species collection/i });
const stored = async () => (await db.speciesMeta.get('limits'))?.value;
const labels = (select: HTMLElement) => within(select).getAllByRole('option').map(o => o.textContent);

describe('SpeciesCapSetting', () => {
    it('offers Small, Medium and Large, like Flower Detail, and starts on Medium', async () => {
        render(<SpeciesCapSetting source={h.source} />);
        const select = await cap();
        expect(labels(select)).toEqual(['Small (25)', 'Medium (50)', 'Large (100)']);
        expect(select).toHaveValue('50');
    });

    it('shows what the player chose before', async () => {
        await db.speciesMeta.put({ key: 'limits', value: { cap: 100 } });
        render(<SpeciesCapSetting source={h.source} />);
        await waitFor(async () => expect(await cap()).toHaveValue('100'));
    });

    it('shows a cap that is none of the three as Custom, and keeps it', async () => {
        await db.speciesMeta.put({ key: 'limits', value: { cap: 33 } });
        render(<SpeciesCapSetting source={h.source} />);
        const select = await cap();
        await waitFor(() => expect(select).toHaveValue('33'));
        expect(labels(select)).toEqual(['Small (25)', 'Custom (33)', 'Medium (50)', 'Large (100)']);
    });

    it('raises at once, with no confirmation, and keeps it for the flower worker to read', async () => {
        render(<SpeciesCapSetting source={h.source} />);
        fireEvent.change(await cap(), { target: { value: '100' } });
        await waitFor(async () => expect(await stored()).toEqual({ cap: 100 }));
        await waitFor(async () => expect(await cap()).toHaveValue('100'));
        expect(screen.queryByText('Keep fewer samples?')).not.toBeInTheDocument();
    });

    it('asks before it lowers it, and does nothing if the player does not agree', async () => {
        render(<SpeciesCapSetting source={h.source} />);
        fireEvent.change(await cap(), { target: { value: '25' } });
        expect(screen.getByText('Keep fewer samples?')).toBeInTheDocument();
        expect(screen.getByText(/Keeping 25 samples per species/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByText('Keep fewer samples?')).not.toBeInTheDocument();
        expect(await stored()).toBeUndefined();
        expect(await cap()).toHaveValue('50');
    });

    it('lowers it when the player agrees', async () => {
        render(<SpeciesCapSetting source={h.source} />);
        fireEvent.change(await cap(), { target: { value: '25' } });
        fireEvent.click(screen.getByRole('button', { name: 'Lower it' }));
        await waitFor(async () => expect(await stored()).toEqual({ cap: 25 }));
        await waitFor(async () => expect(await cap()).toHaveValue('25'));
    });

    it('keeps what is shown when the cap cannot be saved', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(h.source, 'setCap').mockRejectedValue(new Error('disk full'));
        render(<SpeciesCapSetting source={h.source} />);
        fireEvent.change(await cap(), { target: { value: '100' } });
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be saved/i));
        expect(await cap()).toHaveValue('50');
    });

    it('uses the default when the limits cannot be read', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(h.source, 'limits').mockRejectedValue(new Error('no db'));
        render(<SpeciesCapSetting source={h.source} />);
        expect(await cap()).toHaveValue('50');
    });

    it('asks in the body, so the side panel it sits in cannot trap the question', async () => {
        const { container } = render(<div style={{ transform: 'translateX(0)' }}><SpeciesCapSetting source={h.source} /></div>);
        fireEvent.change(await cap(), { target: { value: '25' } });
        const title = screen.getByText('Keep fewer samples?');
        expect(container.contains(title)).toBe(false);
        expect(document.body.contains(title)).toBe(true);
    });

    it('says how much a species keeps, and that the worker applies it', async () => {
        render(<SpeciesCapSetting source={h.source} />);
        await cap();
        expect(screen.getByText(/each species keeps/i)).toBeInTheDocument();
    });
});
