import { useCallback, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { Flower3DViewer } from '../components/Flower3DViewer';
import { LoaderIcon } from '../components/icons';
import { flowerService } from '../services/flowerService';

type Sex = 'male' | 'female' | 'both';

/**
 * The 3D view of a flower, in a modal: `view` makes the model and opens it, `modal` is what to render. The garden is
 * paused while the model is shown, and only started again if it was running.
 */
export function useFlower3DView({ isRunning, setIsRunning }: { isRunning: boolean; setIsRunning: (running: boolean) => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [gltfString, setGltfString] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [title, setTitle] = useState('');
    const wasRunning = useRef(false);

    const view = useCallback(async (genome: string, sex: Sex) => {
        wasRunning.current = isRunning;
        setIsRunning(false);
        setIsLoading(true);
        setGltfString(null);
        setIsOpen(true);
        setTitle('Generating 3D Model...');
        try {
            setGltfString(await flowerService.draw3DFlower(genome, sex));
            setTitle('Champion Flower 3D Model');
        } catch (error) {
            console.error('Failed to generate 3D model:', error);
            setIsOpen(false);
            setIsRunning(wasRunning.current);
        } finally {
            setIsLoading(false);
        }
    }, [isRunning, setIsRunning]);

    const close = useCallback(() => {
        setIsOpen(false);
        setIsRunning(wasRunning.current);
    }, [setIsRunning]);

    const modal = (
        <Modal isOpen={isOpen} onClose={close} title={title}>
            {isLoading || !gltfString ? (
                <div className="flex items-center justify-center h-full">
                    <LoaderIcon className="w-12 h-12 animate-spin text-tertiary" />
                </div>
            ) : (
                <Flower3DViewer gltfString={gltfString} />
            )}
        </Modal>
    );

    return { view, modal };
}
