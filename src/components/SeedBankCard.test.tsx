import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeedBankCard } from './SeedBankCard';
import type { SeedBankEntry } from '../types';

const entry: SeedBankEntry = { category: 'longestLived', genome: 'g', value: 321, imageData: 'png', sex: 'female' };
const props = { entry, onDownload: vi.fn(), onView3D: vi.fn() };

describe('SeedBankCard', () => {
    it('shows the champion as it always did, without a species', () => {
        render(<SeedBankCard {...props} />);
        expect(screen.getByText('Longest Lived')).toBeInTheDocument();
        expect(screen.getByText('321 ticks')).toBeInTheDocument();
        expect(screen.queryByText(/View in field guide/)).not.toBeInTheDocument();
    });

    it('names the species of the champion, and offers to see it in the field guide', () => {
        const onViewInGuide = vi.fn();
        render(<SeedBankCard {...props} species={{ key: '3,2', name: 'Stout Lotus' }} onViewInGuide={onViewInGuide} />);
        expect(screen.getByText('Stout Lotus')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'View in field guide' }));
        expect(onViewInGuide).toHaveBeenCalledExactlyOnceWith('3,2');
    });

    it('names the species without a button when there is no field guide to open', () => {
        render(<SeedBankCard {...props} species={{ key: '3,2', name: 'Stout Lotus' }} />);
        expect(screen.getByText('Stout Lotus')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'View in field guide' })).not.toBeInTheDocument();
    });

    it('keeps its download and 3D buttons', () => {
        render(<SeedBankCard {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Download/ }));
        fireEvent.click(screen.getByRole('button', { name: /View 3D/ }));
        expect(props.onDownload).toHaveBeenCalledWith('g', 'longestLived');
        expect(props.onView3D).toHaveBeenCalledWith('g', 'female');
    });
});
