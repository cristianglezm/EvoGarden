import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
    it('shows nothing when it is closed', () => {
        render(<Modal isOpen={false} onClose={vi.fn()} title="T">content</Modal>);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows its title and content, and closes from the button and from the backdrop, not from the content', () => {
        const onClose = vi.fn();
        render(<Modal isOpen onClose={onClose} title="Title">content</Modal>);
        expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
        fireEvent.click(screen.getByText('content'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByLabelText('Close modal'));
        fireEvent.click(screen.getByRole('dialog'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('is as it always was by default, and takes most of the screen when asked', () => {
        const { rerender } = render(<Modal isOpen onClose={vi.fn()} title="T">c</Modal>);
        const panel = () => screen.getByRole('dialog').firstElementChild!;
        expect(panel()).toHaveClass('max-w-3xl', 'max-h-[80vh]');
        rerender(<Modal isOpen onClose={vi.fn()} title="T" size="screen">c</Modal>);
        expect(panel()).toHaveClass('w-[90vw]', 'h-[90vh]');
        expect(panel()).not.toHaveClass('max-w-3xl');
        expect(panel()).not.toHaveClass('max-h-[80vh]');
    });
});
