import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { FieldGuideModal } from './FieldGuideModal';
import { createGuideHarness, stubCanvas } from '../test/guideHarness';
import { createSpeciesSource } from '../services/speciesSource';
import { db } from '../services/db';
import { parseSom, speciesName } from '../lib/species';
import type { SeedBankEntry } from '../types';

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

type Props = Partial<React.ComponentProps<typeof FieldGuideModal>>;
const guide = (props: Props = {}) => (
    <FieldGuideModal isOpen onClose={vi.fn()} source={h.source} champions={[]} onDownload={vi.fn()} onView3D={vi.fn()} intervalMs={40} {...props} />
);
const ready = () => screen.findByRole('group', { name: /Species map/ });
const cell = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });
const STOUT_LOTUS = speciesName(3, 2, 12);
const SLENDER_ASTER = speciesName(0, 0, 12);

describe('FieldGuideModal', () => {
    describe('the map', () => {
        it('shows nothing, and reads nothing, while it is closed', async () => {
            stubCanvas();
            const samples = vi.spyOn(h.source, 'samples');
            render(guide({ isOpen: false }));
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(samples).not.toHaveBeenCalled();
        });

        it('has a button for each of the 96 species, none discovered in an empty collection', async () => {
            stubCanvas();
            render(guide());
            expect(await ready()).toHaveAccessibleName('Species map: 0 of 96 species discovered');
            expect(screen.getByText('0 / 96 species discovered')).toBeInTheDocument();
            const cells = screen.getAllByRole('button', { name: /, not discovered$/ });
            expect(cells).toHaveLength(96);
            expect(cell(SLENDER_ASTER)).toBeInTheDocument();
        });

        it('says which species were discovered, and how many', async () => {
            stubCanvas();
            await h.offer('g-a', 3, 2);
            await h.offer('g-b', 3, 2);
            await h.offer('g-c', 0, 0);
            render(guide());
            await ready();
            expect(screen.getByText('2 / 96 species discovered')).toBeInTheDocument();
            expect(cell(STOUT_LOTUS)).toHaveAccessibleName(`${STOUT_LOTUS}, discovered`);
            expect(cell(SLENDER_ASTER)).toHaveAccessibleName(`${SLENDER_ASTER}, discovered`);
            expect(screen.getAllByRole('button', { name: /, not discovered$/ })).toHaveLength(94);
            expect(screen.getByText(/3 samples kept · 0 atypical · 0 without a species/)).toBeInTheDocument();
        });

        it('shows the image of the flower that found a species, and the silhouette where there is none', async () => {
            stubCanvas();
            await h.offer('g-a', 3, 2, { image: 'png-of-a' });
            render(guide());
            await ready();
            expect(cell(STOUT_LOTUS).querySelector('img')).toHaveAttribute('src', 'png-of-a');
            expect(cell(SLENDER_ASTER).querySelector('img')).toBeNull();
            expect(cell(SLENDER_ASTER).querySelector('canvas')).not.toBeNull();
        });

        it('draws the silhouette of each species as the classifier has it', async () => {
            const { putImageData } = stubCanvas();
            render(guide());
            await ready();
            const first = (putImageData.mock.calls[0][0] as ImageData).data;
            const prototype = parseSom(h.classifier.classifierJson());
            const expected = Array.from({ length: 256 }, (_, i) => Math.round(Math.min(1, Math.max(0, prototype.weights[i])) * 255));
            expect(Array.from({ length: 256 }, (_, i) => first[i * 4 + 3])).toEqual(expected);
            expect(putImageData.mock.calls.length).toBeGreaterThanOrEqual(96);
        });

        it('marks the species a champion of the garden belongs to', async () => {
            stubCanvas();
            await h.offer('g-champion', 1, 1);
            const champions = [{ category: 'longestLived', genome: 'g-champion', value: 300, imageData: '', sex: 'both' }] as SeedBankEntry[];
            render(guide({ champions }));
            await ready();
            expect(cell(speciesName(1, 1, 12))).toHaveAccessibleName(`${speciesName(1, 1, 12)}, discovered, home of a champion`);
            fireEvent.click(cell(speciesName(1, 1, 12)));
            expect(screen.getByText('Home of the champion: Longest lived')).toBeInTheDocument();
        });

        it('says the collection is being updated, and does not plot what another classifier placed', async () => {
            stubCanvas();
            await h.repository.offer({ genome: 'g-old', match: { x: 5, y: 5, distance: 1 }, fp: 'a-classifier-before', sex: 'both' });
            render(guide());
            await ready();
            expect(screen.getByRole('status')).toHaveTextContent('Updating the collection for a new classifier: 1 sample left.');
            expect(screen.getByText('0 / 96 species discovered')).toBeInTheDocument();
        });

        it('says how many flowers wait to be classified, when some do', async () => {
            render(guide({ waiting: 12 }));
            await ready();
            expect(screen.getByText('12 flowers are waiting to be classified.')).toBeInTheDocument();
        });

        it('says it in the singular for one flower, and says nothing when none waits or it is not known', async () => {
            const { unmount } = render(guide({ waiting: 1 }));
            await ready();
            expect(screen.getByText('1 flower is waiting to be classified.')).toBeInTheDocument();
            unmount();
            render(guide({ waiting: 0 }));
            await ready();
            expect(screen.queryByText(/waiting to be classified/)).not.toBeInTheDocument();
        });

        it('does not say it when it is not told', async () => {
            render(guide());
            await ready();
            expect(screen.queryByText(/waiting to be classified/)).not.toBeInTheDocument();
        });

        it('says so when the classifier is not ready', async () => {
            stubCanvas();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const notReady = {
                ...h.source,
                grid: () => {
                    throw new Error('call FEService.init() before using it');
                },
            };
            render(guide({ source: notReady }));
            expect(await screen.findByText(/classifier is not ready yet/)).toBeInTheDocument();
        });

        it('takes most of the screen, with a margin, and puts the species beside the map on a wide one', async () => {
            stubCanvas();
            render(guide({ initialCell: '3,2' }));
            await ready();
            expect(screen.getByRole('dialog').firstElementChild).toHaveClass('w-[90vw]', 'h-[90vh]');
            const map = screen.getByRole('group', { name: /Species map/ });
            const columns = map.parentElement!.parentElement!;
            expect(columns).toHaveClass('xl:grid');
            expect(columns).toContainElement(screen.getByRole('region', { name: STOUT_LOTUS }));
        });

        it('closes from its button', async () => {
            stubCanvas();
            const onClose = vi.fn();
            render(guide({ onClose }));
            await ready();
            fireEvent.click(screen.getByLabelText('Close modal'));
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('while it is open', () => {
        it('shows a species that is discovered meanwhile', async () => {
            stubCanvas();
            render(guide());
            await ready();
            expect(screen.getByText('0 / 96 species discovered')).toBeInTheDocument();
            await h.offer('g-late', 4, 4);
            expect(await screen.findByText('1 / 96 species discovered')).toBeInTheDocument();
        });

        it('keeps what it shows while reading the collection fails', async () => {
            stubCanvas();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            await h.offer('g-a', 3, 2);
            render(guide());
            await ready();
            vi.spyOn(h.source, 'samples').mockRejectedValue(new Error('disk'));
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(screen.getByText('1 / 96 species discovered')).toBeInTheDocument();
            expect(screen.queryByText(/not ready yet/)).not.toBeInTheDocument();
        });

        it('stops reading when it is closed', async () => {
            stubCanvas();
            const { rerender } = render(guide());
            await ready();
            rerender(guide({ isOpen: false }));
            const samples = vi.spyOn(h.source, 'samples');
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(samples).not.toHaveBeenCalled();
        });
    });

    describe('a species', () => {
        it('is selected by its button, and again to let go of it', async () => {
            stubCanvas();
            render(guide());
            await ready();
            expect(screen.getByText('Select a species to see its records.')).toBeInTheDocument();
            fireEvent.click(cell(STOUT_LOTUS));
            expect(cell(STOUT_LOTUS)).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByRole('region', { name: STOUT_LOTUS })).toBeInTheDocument();
            fireEvent.click(cell(STOUT_LOTUS));
            expect(screen.queryByRole('region', { name: STOUT_LOTUS })).not.toBeInTheDocument();
        });

        it('is the one asked for when the guide opens', async () => {
            stubCanvas();
            render(guide({ initialCell: '3,2' }));
            await ready();
            expect(screen.getByRole('region', { name: STOUT_LOTUS })).toBeInTheDocument();
            expect(cell(STOUT_LOTUS)).toHaveAttribute('aria-pressed', 'true');
        });

        it('that is not discovered says so, and has no records', async () => {
            stubCanvas();
            render(guide({ initialCell: '3,2' }));
            await ready();
            const detail = screen.getByRole('region', { name: STOUT_LOTUS });
            expect(detail).toHaveTextContent('Not discovered yet');
            expect(within(detail).queryByRole('list')).not.toBeInTheDocument();
        });

        it('that has no record yet says that no flower of it has finished its life', async () => {
            stubCanvas();
            await h.offer('g-a', 3, 2);
            render(guide({ initialCell: '3,2' }));
            await ready();
            const detail = screen.getByRole('region', { name: STOUT_LOTUS });
            expect(detail).toHaveTextContent('1 samples kept');
            expect(detail).toHaveTextContent('has finished its life yet');
        });

        it('shows who holds each record, with the value and the picture', async () => {
            stubCanvas();
            await h.record('g-long', 3, 2, { age: 120, toxicity: 0.4, image: 'png-long', sex: 'female' });
            await h.record('g-heal', 3, 2, { age: 10, toxicity: -0.25, image: 'png-heal' });
            render(guide({ initialCell: '3,2' }));
            await ready();

            const detail = screen.getByRole('region', { name: STOUT_LOTUS });
            const items = within(detail).getAllByRole('listitem');
            expect(items).toHaveLength(3);
            expect(items[0]).toHaveTextContent('Longest lived120 ticks');
            expect(items[1]).toHaveTextContent('Most toxic40% toxicity');
            expect(items[2]).toHaveTextContent('Most healing25% healing');
            await waitFor(() => expect(within(items[0]).getByRole('img')).toHaveAttribute('src', 'png-long'));
            await waitFor(() => expect(within(items[2]).getByRole('img')).toHaveAttribute('src', 'png-heal'));
        });
    });

    describe('the buttons of a record', () => {
        async function openWithRecords(props: Props = {}) {
            stubCanvas();
            await h.record('genome-of-the-longest', 3, 2, { age: 120, toxicity: 0.4, image: 'png', sex: 'female' });
            render(guide({ initialCell: '3,2', ...props }));
            await ready();
            return within(screen.getByRole('region', { name: STOUT_LOTUS })).getAllByRole('listitem')[0];
        }

        it('download the genome, named for the species and the record', async () => {
            const onDownload = vi.fn();
            const item = await openWithRecords({ onDownload });
            fireEvent.click(within(item).getByRole('button', { name: /Download/ }));
            await waitFor(() => expect(onDownload).toHaveBeenCalledExactlyOnceWith('genome-of-the-longest', '3-2_longestLived'));
        });

        it('show the flower in 3D with its sex', async () => {
            const onView3D = vi.fn();
            const item = await openWithRecords({ onView3D });
            fireEvent.click(within(item).getByRole('button', { name: /View 3D/ }));
            await waitFor(() => expect(onView3D).toHaveBeenCalledExactlyOnceWith('genome-of-the-longest', 'female'));
        });

        it('plant a seed of it, when planting is possible', async () => {
            const onPlant = vi.fn();
            const item = await openWithRecords({ onPlant });
            fireEvent.click(within(item).getByRole('button', { name: /Plant/ }));
            await waitFor(() => expect(onPlant).toHaveBeenCalledExactlyOnceWith('genome-of-the-longest', 'female'));
        });

        it('have no button to plant when planting is not possible', async () => {
            const item = await openWithRecords();
            expect(within(item).queryByRole('button', { name: /Plant/ })).not.toBeInTheDocument();
        });
    });

    const readBlob = (blob: Blob): Promise<string> =>
        typeof blob.text === 'function'
            ? blob.text()
            : new Promise(resolve => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.readAsText(blob);
              });
    const collectButton = () => screen.getByRole('button', { name: /Collect samples|Collecting/ });

    describe('collecting samples', () => {
        it('saves the samples and their manifest as two files, and says what it saved', async () => {
            stubCanvas();
            await h.offer('{"Flower":{"n":1}}', 3, 2, { age: 10 });
            await h.offer('{"Flower":{"n":2}}', 0, 0);
            const onSave = vi.fn();
            render(guide({ onSave, appVersion: '1.2.3' }));
            await ready();

            fireEvent.click(collectButton());
            await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
            const [[samples, samplesName], [manifest, manifestName]] = onSave.mock.calls;
            expect(samplesName).toMatch(/^evogarden-samples-\d{4}-\d{2}-\d{2}\.json$/);
            expect(manifestName).toBe(samplesName.replace('.json', '-manifest.json'));
            expect(JSON.parse(await readBlob(samples)).Generation).toHaveLength(2);
            expect(JSON.parse(await readBlob(manifest))).toMatchObject({ appVersion: '1.2.3', counts: { flowers: 2, species: 2 } });
            expect(await screen.findByText('Saved 2 flowers from 2 species.')).toBeInTheDocument();
        });

        it('has nothing to collect in an empty collection', async () => {
            stubCanvas();
            render(guide());
            await ready();
            expect(collectButton()).toBeDisabled();
        });

        it('waits until the collection has been classified again, and says so', async () => {
            stubCanvas();
            await h.offer('{"Flower":{"n":1}}', 3, 2);
            await h.repository.offer({ genome: '{"Flower":{"n":2}}', match: { x: 1, y: 1, distance: 1 }, fp: 'a-classifier-before', sex: 'both' });
            render(guide());
            await ready();
            expect(collectButton()).toBeDisabled();
            expect(screen.getByText(/Samples can be collected when the collection has been updated/)).toBeInTheDocument();
        });

        it('leaves out the samples without a species when asked, and says what it saved', async () => {
            stubCanvas();
            await h.offer('{"Flower":{"n":1}}', 3, 2);
            await h.repository.offer({ genome: '{"Flower":{}}', match: null, fp: h.classifier.fingerprint, sex: 'both' });
            const onSave = vi.fn();
            render(guide({ onSave }));
            await ready();

            fireEvent.click(collectButton());
            expect(await screen.findByText('Saved 2 flowers from 1 species (1 without a species).')).toBeInTheDocument();
            expect(JSON.parse(await readBlob(onSave.mock.calls[0][0])).Generation).toHaveLength(2);

            onSave.mockClear();
            fireEvent.click(screen.getByLabelText('Include samples without a species'));
            fireEvent.click(collectButton());
            await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
            expect(JSON.parse(await readBlob(onSave.mock.calls[0][0])).Generation).toHaveLength(1);
            expect(await screen.findByText('Saved 1 flowers from 1 species.')).toBeInTheDocument();
        });

        it('has nothing to collect when only the samples without a species are there and they are left out', async () => {
            stubCanvas();
            await h.repository.offer({ genome: '{"Flower":{}}', match: null, fp: h.classifier.fingerprint, sex: 'both' });
            render(guide());
            await ready();
            expect(collectButton()).toBeEnabled();
            fireEvent.click(screen.getByLabelText('Include samples without a species'));
            expect(collectButton()).toBeDisabled();
        });

        it('shows that it is working, and cannot be started twice', async () => {
            stubCanvas();
            await h.offer('{"Flower":{"n":1}}', 3, 2);
            const onSave = vi.fn();
            render(guide({ onSave }));
            await ready();

            let open!: () => void;
            const gate = new Promise<void>(resolve => {
                open = resolve;
            });
            const samples = h.source.samples.bind(h.source);
            vi.spyOn(h.source, 'samples').mockImplementation(() => gate.then(samples));
            fireEvent.click(collectButton());
            expect(collectButton()).toHaveTextContent('Collecting…');
            expect(collectButton()).toBeDisabled();
            open();
            await waitFor(() => expect(collectButton()).toHaveTextContent('Collect samples'));
            expect(onSave).toHaveBeenCalledTimes(2);
        });

        it('says when it could not collect, and can be tried again', async () => {
            stubCanvas();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            await h.offer('{"Flower":{"n":1}}', 3, 2);
            const onSave = vi.fn();
            render(guide({ onSave }));
            await ready();

            vi.spyOn(h.source, 'samples').mockRejectedValue(new Error('disk'));
            fireEvent.click(collectButton());
            expect(await screen.findByText('The samples could not be collected.')).toBeInTheDocument();
            expect(onSave).not.toHaveBeenCalled();
            expect(collectButton()).toBeEnabled();
        });
    });

    describe('the storage', () => {
        it('says what the site stores, when the browser says', async () => {
            stubCanvas();
            const source = createSpeciesSource(
                db,
                () => h.classifier,
                async () => ({ usage: 150 * 1024 ** 2, quota: 2 * 1024 ** 3 })
            );
            render(guide({ source }));
            await ready();
            expect(screen.getByText('Storage used by this site: 150 MB of 2.0 GB')).toBeInTheDocument();
        });

        it('says nothing when the browser does not', async () => {
            stubCanvas();
            render(guide());
            await ready();
            expect(screen.queryByText(/Storage used by this site/)).not.toBeInTheDocument();
        });
    });

    describe('the cap of samples per species', () => {
        it('is chosen in Controls, not here: the guide has no select for it', async () => {
            stubCanvas();
            render(guide());
            await ready();
            expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        });

        it('says how many samples each species keeps', async () => {
            stubCanvas();
            render(guide());
            await ready();
            expect(screen.getByText('Each species keeps up to 50 samples.')).toBeInTheDocument();
        });

        it('says the cap the player chose, and follows a change made while it is open', async () => {
            stubCanvas();
            await db.speciesMeta.put({ key: 'limits', value: { cap: 100 } });
            render(guide());
            await ready();
            expect(screen.getByText('Each species keeps up to 100 samples.')).toBeInTheDocument();
            await db.speciesMeta.put({ key: 'limits', value: { cap: 25 } });
            expect(await screen.findByText('Each species keeps up to 25 samples.')).toBeInTheDocument();
        });
    });
});
