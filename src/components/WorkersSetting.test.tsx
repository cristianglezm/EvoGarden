import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WorkersSetting } from './WorkersSetting';
import { WORKERS_KEY } from '../lib/workerSetting';

const storageOf = (initial: Record<string, string> = {}) => {
    const data: Record<string, string> = { ...initial };
    return {
        data,
        getItem: (key: string) => data[key] ?? null,
        setItem: vi.fn((key: string, value: string) => {
            data[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete data[key];
        }),
    };
};
const select = () => screen.getByRole('combobox', { name: /Workers/i });
const labels = () =>
    within(select())
        .getAllByRole('option')
        .map(o => o.textContent);

describe('WorkersSetting', () => {
    it('offers automatic, with the number it would use here, and one to eight workers', () => {
        render(<WorkersSetting environment={{ hardwareConcurrency: 8 }} storage={storageOf()} />);
        expect(labels()).toEqual(['Automatic (4)', '1', '2', '3', '4', '5', '6', '7', '8']);
        expect(select()).toHaveValue('auto');
    });

    it('says how many the automatic choice is on other machines, and when it does not know the cores', () => {
        const { unmount } = render(<WorkersSetting environment={{ hardwareConcurrency: 2 }} storage={storageOf()} />);
        expect(labels()[0]).toBe('Automatic (1)');
        unmount();
        render(<WorkersSetting environment={{}} storage={storageOf()} />);
        expect(labels()[0]).toBe('Automatic (2)');
    });

    it('starts on what the player chose before', () => {
        render(<WorkersSetting environment={{ hardwareConcurrency: 8 }} storage={storageOf({ [WORKERS_KEY]: '3' })} />);
        expect(select()).toHaveValue('3');
    });

    it('starts on automatic when what was saved is not a number of workers', () => {
        render(<WorkersSetting environment={{ hardwareConcurrency: 8 }} storage={storageOf({ [WORKERS_KEY]: 'lots' })} />);
        expect(select()).toHaveValue('auto');
    });

    it('saves the choice and says it applies when the page is loaded again, not at once', () => {
        const storage = storageOf();
        render(<WorkersSetting environment={{ hardwareConcurrency: 8 }} storage={storage} />);
        fireEvent.change(select(), { target: { value: '5' } });
        expect(storage.data[WORKERS_KEY]).toBe('5');
        expect(select()).toHaveValue('5');
        expect(screen.getByRole('status', { name: 'Workers result' })).toHaveTextContent('5 workers will be used when the page is loaded again.');
    });

    it('says "1 worker" in the singular', () => {
        render(<WorkersSetting environment={{ hardwareConcurrency: 8 }} storage={storageOf()} />);
        fireEvent.change(select(), { target: { value: '1' } });
        expect(screen.getByRole('status', { name: 'Workers result' })).toHaveTextContent('1 worker will be used when the page is loaded again.');
    });

    it('takes the saved choice away when the player goes back to automatic, and says how many that is', () => {
        const storage = storageOf({ [WORKERS_KEY]: '3' });
        render(<WorkersSetting environment={{ hardwareConcurrency: 8 }} storage={storage} />);
        fireEvent.change(select(), { target: { value: 'auto' } });
        expect(WORKERS_KEY in storage.data).toBe(false);
        expect(screen.getByRole('status', { name: 'Workers result' })).toHaveTextContent('4 workers will be used when the page is loaded again.');
    });

    it('says it could not save the choice, and keeps what was chosen before', () => {
        const storage = storageOf({ [WORKERS_KEY]: '3' });
        storage.setItem.mockImplementation(() => {
            throw new Error('full');
        });
        render(<WorkersSetting environment={{ hardwareConcurrency: 8 }} storage={storage} />);
        fireEvent.change(select(), { target: { value: '6' } });
        expect(screen.getByRole('status', { name: 'Workers result' })).toHaveTextContent('could not be saved');
        expect(select()).toHaveValue('3');
    });

    it('explains what a worker does, so the choice is not made blind', () => {
        render(<WorkersSetting environment={{ hardwareConcurrency: 8 }} storage={storageOf()} />);
        expect(screen.getByText(/one only classifies the species, the others make flowers and classify when they have none to make/i)).toBeInTheDocument();
    });
});
