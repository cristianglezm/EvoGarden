import '@testing-library/jest-dom';
import React, { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDismissOnOutsideClick } from './useDismissOnOutsideClick';
import { Modal } from '../components/Modal';
import { ConfirmationModal } from '../components/ConfirmationModal';

interface HarnessProps {
    enabled?: boolean;
    onOutside: () => void;
    modal?: 'none' | 'modal' | 'confirmation';
}

// A panel the click is inside of, something else, and (optionally) a modal that React keeps in the panel's tree
// but the browser puts in the body, which is where the 3D view of a flower is.
const Harness: React.FC<HarnessProps> = ({ enabled = true, onOutside, modal = 'none' }) => {
    const panel = useRef<HTMLDivElement>(null);
    const other = useRef<HTMLButtonElement>(null);
    const missing = useRef<HTMLDivElement>(null);
    useDismissOnOutsideClick(enabled, [panel, other, missing], onOutside);
    return (
        <div>
            <div ref={panel} data-testid="panel">
                panel
                {modal === 'modal' && <Modal isOpen onClose={() => {}} title="3D"><button>spin</button></Modal>}
                {modal === 'confirmation' && <ConfirmationModal title="Sure?" message="really" onConfirm={() => {}} onCancel={() => {}} />}
            </div>
            <button ref={other}>other button</button>
            <p data-testid="elsewhere">elsewhere</p>
        </div>
    );
};

describe('useDismissOnOutsideClick', () => {
    it('calls back when the mouse goes down outside everything it was told about', () => {
        const onOutside = vi.fn();
        render(<Harness onOutside={onOutside} />);
        fireEvent.mouseDown(screen.getByTestId('elsewhere'));
        expect(onOutside).toHaveBeenCalledTimes(1);
    });

    it('does not call back for a click inside any of the elements, and ignores a ref with nothing in it', () => {
        const onOutside = vi.fn();
        render(<Harness onOutside={onOutside} />);
        fireEvent.mouseDown(screen.getByTestId('panel'));
        fireEvent.mouseDown(screen.getByRole('button', { name: 'other button' }));
        expect(onOutside).not.toHaveBeenCalled();
    });

    it('does not call back for a click in a modal, which is in the body and not in the panel it was opened from', () => {
        const onOutside = vi.fn();
        render(<Harness onOutside={onOutside} modal="modal" />);
        expect(screen.getByTestId('panel')).not.toContainElement(screen.getByRole('button', { name: 'spin' }));
        fireEvent.mouseDown(screen.getByRole('button', { name: 'spin' }));
        fireEvent.mouseDown(screen.getByRole('dialog'));
        expect(onOutside).not.toHaveBeenCalled();
    });

    it('does not call back for a click in a confirmation either', () => {
        const onOutside = vi.fn();
        render(<Harness onOutside={onOutside} modal="confirmation" />);
        fireEvent.mouseDown(screen.getByText('really'));
        fireEvent.mouseDown(screen.getByRole('button', { name: 'Cancel' }));
        expect(onOutside).not.toHaveBeenCalled();
    });

    it('goes on calling back for what is outside while a modal is open that was not clicked', () => {
        const onOutside = vi.fn();
        render(<Harness onOutside={onOutside} modal="modal" />);
        fireEvent.mouseDown(screen.getByTestId('elsewhere'));
        expect(onOutside).toHaveBeenCalledTimes(1);
    });

    it('does nothing while it is not enabled, and starts when it is', () => {
        const onOutside = vi.fn();
        const { rerender } = render(<Harness enabled={false} onOutside={onOutside} />);
        fireEvent.mouseDown(screen.getByTestId('elsewhere'));
        expect(onOutside).not.toHaveBeenCalled();
        rerender(<Harness enabled onOutside={onOutside} />);
        fireEvent.mouseDown(screen.getByTestId('elsewhere'));
        expect(onOutside).toHaveBeenCalledTimes(1);
    });

    it('calls the latest callback, not the one it had when it started listening', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = render(<Harness onOutside={first} />);
        rerender(<Harness onOutside={second} />);
        fireEvent.mouseDown(screen.getByTestId('elsewhere'));
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('stops listening when the component goes away, and listens once while it is there', () => {
        const add = vi.spyOn(document, 'addEventListener');
        const remove = vi.spyOn(document, 'removeEventListener');
        const onOutside = vi.fn();
        const { rerender, unmount } = render(<Harness onOutside={onOutside} />);
        rerender(<Harness onOutside={vi.fn()} />);
        rerender(<Harness onOutside={vi.fn()} />);
        expect(add.mock.calls.filter(c => c[0] === 'mousedown')).toHaveLength(1);
        unmount();
        expect(remove.mock.calls.filter(c => c[0] === 'mousedown')).toHaveLength(1);
        fireEvent.mouseDown(document.body);
        expect(onOutside).not.toHaveBeenCalled();
        add.mockRestore();
        remove.mockRestore();
    });
});
