import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useFlower3DView } from './useFlower3DView';
import { flowerService } from '../services/flowerService';

vi.mock('../components/Flower3DViewer', () => ({ Flower3DViewer: ({ gltfString }: { gltfString: string }) => <div data-testid="viewer-3d">{gltfString}</div> }));
vi.mock('../services/flowerService', () => ({ flowerService: { draw3DFlower: vi.fn() } }));

let view: (genome: string, sex: 'male' | 'female' | 'both') => Promise<void>;
const Harness = ({ isRunning, setIsRunning }: { isRunning: boolean; setIsRunning: (running: boolean) => void }) => {
    const result = useFlower3DView({ isRunning, setIsRunning });
    view = result.view;
    return <div>{result.modal}</div>;
};

describe('useFlower3DView', () => {
    const setIsRunning = vi.fn();
    beforeEach(() => {
        setIsRunning.mockClear();
        vi.mocked(flowerService.draw3DFlower).mockReset().mockResolvedValue('gltf-text');
    });

    it('shows nothing until a flower is asked for', () => {
        render(<Harness isRunning setIsRunning={setIsRunning} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(setIsRunning).not.toHaveBeenCalled();
    });

    it('pauses the garden, says it is generating, and shows the model once it is made', async () => {
        render(<Harness isRunning setIsRunning={setIsRunning} />);
        let done!: (gltf: string) => void;
        vi.mocked(flowerService.draw3DFlower).mockReturnValue(new Promise<string>(resolve => { done = resolve; }));
        act(() => { void view('genome', 'male'); });
        expect(setIsRunning).toHaveBeenCalledWith(false);
        expect(await screen.findByRole('heading', { name: 'Generating 3D Model...' })).toBeInTheDocument();
        expect(screen.queryByTestId('viewer-3d')).not.toBeInTheDocument();
        await act(async () => done('the-model'));
        expect(screen.getByTestId('viewer-3d')).toHaveTextContent('the-model');
        expect(screen.getByRole('heading', { name: 'Champion Flower 3D Model' })).toBeInTheDocument();
        expect(flowerService.draw3DFlower).toHaveBeenCalledExactlyOnceWith('genome', 'male');
    });

    it('closes, and starts the garden again only if it was running', async () => {
        const { unmount } = render(<Harness isRunning setIsRunning={setIsRunning} />);
        await act(async () => { await view('genome', 'both'); });
        setIsRunning.mockClear();
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(screen.queryByTestId('viewer-3d')).not.toBeInTheDocument();
        expect(setIsRunning).toHaveBeenCalledExactlyOnceWith(true);
        unmount();

        setIsRunning.mockClear();
        render(<Harness isRunning={false} setIsRunning={setIsRunning} />);
        await act(async () => { await view('genome', 'both'); });
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(setIsRunning).toHaveBeenLastCalledWith(false);
    });

    it('closes and gives the garden back when the model cannot be made', async () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(flowerService.draw3DFlower).mockRejectedValue(new Error('no gl'));
        render(<Harness isRunning setIsRunning={setIsRunning} />);
        await act(async () => { await view('genome', 'both'); });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(setIsRunning).toHaveBeenNthCalledWith(1, false);
        expect(setIsRunning).toHaveBeenLastCalledWith(true);
        quiet.mockRestore();
    });

    it('shows the model of the flower asked for last', async () => {
        render(<Harness isRunning setIsRunning={setIsRunning} />);
        vi.mocked(flowerService.draw3DFlower).mockResolvedValueOnce('first').mockResolvedValueOnce('second');
        await act(async () => { await view('a', 'both'); });
        await act(async () => { await view('b', 'both'); });
        expect(screen.getByTestId('viewer-3d')).toHaveTextContent('second');
    });
});
