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

    describe('where it is rendered', () => {
        // A side panel that slides in with a CSS transform (even translate-x-0) becomes the containing block of
        // everything `fixed` inside it, so a modal opened from the panel was as big as the panel.
        it('is at the end of the page, not inside the element that opens it', () => {
            render(
                <div data-testid="side-panel" style={{ transform: 'translateX(0)' }}>
                    <Modal isOpen onClose={vi.fn()} title="T">c</Modal>
                </div>,
            );
            const dialog = screen.getByRole('dialog');
            expect(dialog.parentElement).toBe(document.body);
            expect(screen.getByTestId('side-panel')).not.toContainElement(dialog);
        });

        it('is taken away with the component that opened it', () => {
            const { unmount } = render(<Modal isOpen onClose={vi.fn()} title="T">c</Modal>);
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            unmount();
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('keeps its place in the tree for what is inside it: clicks and focus work as before', () => {
            const onClose = vi.fn();
            const onInside = vi.fn();
            render(<Modal isOpen onClose={onClose} title="T"><button onClick={onInside}>inside</button></Modal>);
            fireEvent.click(screen.getByText('inside'));
            expect(onInside).toHaveBeenCalledTimes(1);
            expect(onClose).not.toHaveBeenCalled();
        });

        it('puts a modal that is opened later over the one opened before', () => {
            const { rerender } = render(
                <>
                    <Modal isOpen onClose={vi.fn()} title="First">a</Modal>
                    <Modal isOpen={false} onClose={vi.fn()} title="Second">b</Modal>
                </>,
            );
            rerender(
                <>
                    <Modal isOpen onClose={vi.fn()} title="First">a</Modal>
                    <Modal isOpen onClose={vi.fn()} title="Second">b</Modal>
                </>,
            );
            const titles = screen.getAllByRole('dialog').map(d => d.querySelector('h3')!.textContent);
            expect(titles).toEqual(['First', 'Second']);
        });
    });
});

