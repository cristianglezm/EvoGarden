import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FullEventLogPanel } from './FullEventLogPanel';
import { useEventLogStore } from '../stores/eventLogStore';
import type { AppEvent } from '../types';

describe('FullEventLogPanel', () => {
    const mockOnClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the store before each test
        act(() => {
            useEventLogStore.setState({ entries: [] });
        });
    });

    it('is visible when isOpen is true', () => {
        render(<FullEventLogPanel isOpen={true} onClose={mockOnClose} />);
        const panel = screen.getByRole('complementary'); // <aside> role
        expect(panel).toBeInTheDocument();
        expect(panel).toHaveClass('translate-x-0');
        expect(panel).not.toHaveClass('translate-x-full');
    });

    it('is hidden when isOpen is false', () => {
        render(<FullEventLogPanel isOpen={false} onClose={mockOnClose} />);
        const panel = screen.getByRole('complementary');
        expect(panel).toHaveClass('translate-x-full');
        expect(panel).not.toHaveClass('translate-x-0');
    });

    it('calls onClose when the close button is clicked', () => {
        render(<FullEventLogPanel isOpen={true} onClose={mockOnClose} />);
        const closeButton = screen.getByLabelText('Close full event log panel');
        fireEvent.click(closeButton);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the overlay is clicked', () => {
        render(<FullEventLogPanel isOpen={true} onClose={mockOnClose} />);
        const overlay = screen.getByRole('complementary').previousElementSibling;
        expect(overlay).not.toBeNull();
        fireEvent.click(overlay!);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('displays a placeholder message when there are no log entries', () => {
        render(<FullEventLogPanel isOpen={true} onClose={mockOnClose} />);
        expect(screen.getByText('No events recorded.')).toBeInTheDocument();
    });

    it('renders log entries from the store', () => {
        // Populate the store with mock entries
        const mockEvents: AppEvent[] = [
            { message: 'Event 1', type: 'info', importance: 'low', tick: 1 },
            { message: 'Event 2', type: 'success', importance: 'high', tick: 2 },
        ];
        act(() => {
            mockEvents.forEach(event => useEventLogStore.getState().addEntry(event));
        });

        render(<FullEventLogPanel isOpen={true} onClose={mockOnClose} />);
        
        expect(screen.getByText('[Tick 0001]')).toBeInTheDocument();
        expect(screen.getByText('Event 1')).toBeInTheDocument();
        expect(screen.getByText('[Tick 0002]')).toBeInTheDocument();
        expect(screen.getByText('Event 2')).toBeInTheDocument();
    });
});
