import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FlowerDetailsPanel } from './FlowerDetailsPanel';
import type { Flower } from '../types';
import type { SpeciesSource } from '../services/speciesSource';
import { flowerService } from '../services/flowerService';

// Mock the flower service
vi.mock('../services/flowerService', () => ({
    flowerService: {
        draw3DFlower: vi.fn(),
        drawEmissive3DFlower: vi.fn(),
    },
}));

// Mock the 3D viewer component to avoid canvas/webgl errors in JSDOM
vi.mock('./Flower3DViewer', () => ({
    Flower3DViewer: () => <div data-testid="flower-3d-viewer-mock" />,
}));

const mockFlower: Flower = {
  id: 'flower-1',
  type: 'flower',
  x: 1,
  y: 1,
  genome: '{"key":"value"}',
  imageData: 'svg-data-string',
  health: 80,
  stamina: 60,
  age: 55,
  isMature: true,
  maxHealth: 120,
  maxStamina: 100,
  nutrientEfficiency: 1.2,
  minTemperature: 5,
  maxTemperature: 25,
  maturationPeriod: 50,
  sex: 'both',
  toxicityRate: 0.1,
  effects: {
    vitality: 10,
    agility: 5,
    strength: 8,
    intelligence: 12,
    luck: 3,
  },
};

describe('FlowerDetailsPanel', () => {
    const mockSetIsRunning = vi.fn();
    const mockOnClose = vi.fn();
    const mockOnTrackActor = vi.fn();
    const mockOnStopTracking = vi.fn();

    const defaultProps = {
        isRunning: false,
        setIsRunning: mockSetIsRunning,
        onClose: mockOnClose,
        onTrackActor: mockOnTrackActor,
        onStopTracking: mockOnStopTracking,
        trackedActorId: null,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock clipboard API
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });
    });

    it('renders placeholder text when no flower is selected', () => {
        render(<FlowerDetailsPanel {...defaultProps} flower={null} />);
        expect(screen.getByText(/Select a flower on the grid/i)).toBeInTheDocument();
    });

    it('renders all flower details correctly when a flower is provided', () => {
        render(<FlowerDetailsPanel {...defaultProps} flower={mockFlower} />);
        
        // Check stats
        expect(screen.getByText('Health')).toBeInTheDocument();
        expect(screen.getByText('80 / 120')).toBeInTheDocument();
        expect(screen.getByText('Stamina')).toBeInTheDocument();
        expect(screen.getByText('60 / 100')).toBeInTheDocument();
        
        // Check state - using parentElement to check the full text of the <p> tag
        expect(screen.getByText(/Age:/i).parentElement).toHaveTextContent('Age: 55 / 50 ticks');
        expect(screen.getByText(/Status:/i).parentElement).toHaveTextContent('Status: Mature');
        
        // Check traits
        expect(screen.getByText(/Sex:/i).parentElement).toHaveTextContent('Sex: both');
        expect(screen.getByText(/Optimal Temp:/i).parentElement).toHaveTextContent('Optimal Temp: 5°C to 25°C');
        expect(screen.getByText(/Toxicity:/i).parentElement).toHaveTextContent('Toxicity: 10%');
        expect(screen.getByText(/Nutrient Efficiency:/i).parentElement).toHaveTextContent('Nutrient Efficiency: 1.20x');

        // Check genome textarea
        expect(screen.getByLabelText('Genome')).toHaveValue(mockFlower.genome);
        
        // Check for track button
        expect(screen.getByTitle('Track this flower')).toBeInTheDocument();
    });

    it('calls onTrackActor when track button is clicked', () => {
        render(<FlowerDetailsPanel {...defaultProps} flower={mockFlower} />);
        const trackButton = screen.getByTitle('Track this flower');
        fireEvent.click(trackButton);
        expect(mockOnTrackActor).toHaveBeenCalledWith(mockFlower.id);
    });

    it('shows Stop button and correct title when tracking this flower', () => {
        render(<FlowerDetailsPanel {...defaultProps} flower={mockFlower} trackedActorId={mockFlower.id} />);
        
        expect(screen.getByText('Tracking:')).toBeInTheDocument();
        
        const stopButton = screen.getByRole('button', { name: /Stop/i });
        expect(stopButton).toBeInTheDocument();
        
        fireEvent.click(stopButton);
        expect(mockOnStopTracking).toHaveBeenCalledTimes(1);
        
        // The individual track button should not be visible
        expect(screen.queryByTitle('Track this flower')).not.toBeInTheDocument();
    });

    it('copies genome to clipboard when copy button is clicked', async () => {
        render(<FlowerDetailsPanel {...defaultProps} flower={mockFlower} />);
        
        const copyButton = screen.getByTitle('Copy genome to clipboard');
        fireEvent.click(copyButton);

        await waitFor(() => {
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockFlower.genome);
        });

        // Check for visual feedback (check icon appears)
        expect(await screen.findByTestId('CheckIcon')).toBeInTheDocument();
    });
    
    it('opens 3D viewer modal when "View in 3D" is clicked', async () => {
        vi.mocked(flowerService.draw3DFlower).mockResolvedValue('<gltf-string>');
        
        render(<FlowerDetailsPanel {...defaultProps} flower={mockFlower} isRunning={true} />);
        
        const view3DButton = screen.getByRole('button', { name: /View in 3D/i });
        fireEvent.click(view3DButton);

        // Should pause the simulation
        expect(mockSetIsRunning).toHaveBeenCalledWith(false);

        // Shows loading state
        expect(screen.getByRole('button', { name: /Generating/i })).toBeInTheDocument();

        // Waits for the modal and mock component to appear
        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByTestId('flower-3d-viewer-mock')).toBeInTheDocument();
        });

        // Close the modal
        const closeButton = screen.getByLabelText('Close modal');
        fireEvent.click(closeButton);

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        // Should resume the simulation to its previous state (running)
        expect(mockSetIsRunning).toHaveBeenCalledWith(true);
    });
});

describe('FlowerDetailsPanel: the species of the flower', () => {
    const props = { isRunning: false, setIsRunning: vi.fn(), onClose: vi.fn(), onTrackActor: vi.fn(), onStopTracking: vi.fn(), trackedActorId: null };
    type Answer = { key: string; name: string; stored: boolean } | null;
    const sourceOf = (speciesFor: (genome: string) => Promise<Answer>) => ({ speciesFor }) as unknown as SpeciesSource;
    const known: Answer = { key: '3,5', name: 'Stout Lotus', stored: true };

    it('says nothing about the species when there is no source for it', () => {
        render(<FlowerDetailsPanel {...props} flower={mockFlower} />);
        expect(screen.queryByText(/Species/)).not.toBeInTheDocument();
    });

    it('shows the name of the species of the flower once it is known, and a mark while it is not', async () => {
        let answer!: (value: Answer) => void;
        const source = sourceOf(() => new Promise<Answer>(resolve => { answer = resolve; }));
        render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={source} />);
        expect(screen.getByText('Species: …')).toBeInTheDocument();
        await act(async () => answer(known));
        expect(screen.getByText('Stout Lotus')).toBeInTheDocument();
        expect(screen.queryByText('Species: …')).not.toBeInTheDocument();
    });

    it('asks for the genome of the flower', async () => {
        const speciesFor = vi.fn().mockResolvedValue(known);
        render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={sourceOf(speciesFor)} />);
        await screen.findByText('Stout Lotus');
        expect(speciesFor).toHaveBeenCalledExactlyOnceWith(mockFlower.genome);
    });

    it('says it is not in the collection when it is only the classifier\'s answer', async () => {
        const source = sourceOf(() => Promise.resolve({ ...known, stored: false }));
        render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={source} />);
        expect(await screen.findByText('Stout Lotus')).toHaveAttribute('title', expect.stringMatching(/not kept in the collection/i));
    });

    it('does not show the mark of the collection for a species that is stored', async () => {
        render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={sourceOf(() => Promise.resolve(known))} />);
        expect(await screen.findByText('Stout Lotus')).not.toHaveAttribute('title');
    });

    it('shows no species for a flower that has none, and when it cannot be told, without failing', async () => {
        const none = sourceOf(() => Promise.resolve(null));
        const { unmount } = render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={none} />);
        await waitFor(() => expect(screen.queryByText('Species: …')).not.toBeInTheDocument());
        expect(screen.queryByText(/^Species/)).not.toBeInTheDocument();
        unmount();
        const failing = sourceOf(() => Promise.reject(new Error('boom')));
        render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={failing} />);
        await waitFor(() => expect(screen.queryByText('Species: …')).not.toBeInTheDocument());
        expect(screen.getByText('Flower Details')).toBeInTheDocument();
    });

    it('asks once for a genome while the flower goes on living, and again for another genome', async () => {
        const speciesFor = vi.fn().mockResolvedValue(known);
        const source = sourceOf(speciesFor);
        const { rerender } = render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={source} />);
        await screen.findByText('Stout Lotus');
        rerender(<FlowerDetailsPanel {...props} flower={{ ...mockFlower, age: 56, health: 79 }} speciesSource={source} />);
        rerender(<FlowerDetailsPanel {...props} flower={{ ...mockFlower, age: 57 }} speciesSource={source} />);
        expect(speciesFor).toHaveBeenCalledTimes(1);
        rerender(<FlowerDetailsPanel {...props} flower={{ ...mockFlower, id: 'flower-2', genome: '{"other":1}' }} speciesSource={source} />);
        await waitFor(() => expect(speciesFor).toHaveBeenCalledTimes(2));
        expect(speciesFor).toHaveBeenLastCalledWith('{"other":1}');
        await screen.findByText('Stout Lotus');
    });

    it('does not keep the species of the flower that was selected before', async () => {
        const answers: Record<string, (value: Answer) => void> = {};
        const source = sourceOf(genome => new Promise<Answer>(resolve => { answers[genome] = resolve; }));
        const { rerender } = render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={source} />);
        rerender(<FlowerDetailsPanel {...props} flower={{ ...mockFlower, id: 'flower-2', genome: 'second' }} speciesSource={source} />);
        // the first answer comes late: it is not the species of the flower that is shown
        await act(async () => answers[mockFlower.genome]({ key: '0,0', name: 'Old Iris', stored: true }));
        expect(screen.queryByText('Old Iris')).not.toBeInTheDocument();
        await act(async () => answers.second({ key: '1,1', name: 'New Rose', stored: true }));
        expect(screen.getByText('New Rose')).toBeInTheDocument();
    });

    it('does not let the failure of the flower selected before hide the species of this one', async () => {
        const failures: Record<string, (error: Error) => void> = {};
        const answers: Record<string, (value: Answer) => void> = {};
        const source = sourceOf(genome => new Promise<Answer>((resolve, reject) => { answers[genome] = resolve; failures[genome] = reject; }));
        const { rerender } = render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={source} />);
        rerender(<FlowerDetailsPanel {...props} flower={{ ...mockFlower, id: 'flower-2', genome: 'second' }} speciesSource={source} />);
        await act(async () => failures[mockFlower.genome](new Error('late')));
        expect(screen.getByText('Species: …')).toBeInTheDocument();
        await act(async () => answers.second(known));
        expect(screen.getByText('Stout Lotus')).toBeInTheDocument();
    });

    describe('the way to the field guide', () => {
        it('opens the guide at the species of the flower', async () => {
            const onViewInGuide = vi.fn();
            render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={sourceOf(() => Promise.resolve(known))} onViewInGuide={onViewInGuide} />);
            fireEvent.click(await screen.findByRole('button', { name: 'View in field guide' }));
            expect(onViewInGuide).toHaveBeenCalledExactlyOnceWith('3,5');
        });

        it('is there for a species that is not in the collection too: the guide shows its cell', async () => {
            const onViewInGuide = vi.fn();
            render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={sourceOf(() => Promise.resolve({ ...known, stored: false }))} onViewInGuide={onViewInGuide} />);
            fireEvent.click(await screen.findByRole('button', { name: 'View in field guide' }));
            expect(onViewInGuide).toHaveBeenCalledExactlyOnceWith('3,5');
        });

        it('is not there when nothing can open the guide', async () => {
            render(<FlowerDetailsPanel {...props} flower={mockFlower} speciesSource={sourceOf(() => Promise.resolve(known))} />);
            await screen.findByText('Stout Lotus');
            expect(screen.queryByRole('button', { name: 'View in field guide' })).not.toBeInTheDocument();
        });

        it('is not there while the species is not known yet, nor when the flower has none', async () => {
            const onViewInGuide = vi.fn();
            let answer!: (value: Answer) => void;
            const { unmount } = render(<FlowerDetailsPanel {...props} flower={mockFlower} onViewInGuide={onViewInGuide}
                speciesSource={sourceOf(() => new Promise<Answer>(resolve => { answer = resolve; }))} />);
            expect(screen.queryByRole('button', { name: 'View in field guide' })).not.toBeInTheDocument();
            await act(async () => answer(null));
            expect(screen.queryByRole('button', { name: 'View in field guide' })).not.toBeInTheDocument();
            unmount();
            render(<FlowerDetailsPanel {...props} flower={mockFlower} onViewInGuide={onViewInGuide} />);
            expect(screen.queryByRole('button', { name: 'View in field guide' })).not.toBeInTheDocument();
        });
    });

    it('does not ask while no flower is selected', async () => {
        const speciesFor = vi.fn().mockResolvedValue(known);
        render(<FlowerDetailsPanel {...props} flower={null} speciesSource={sourceOf(speciesFor)} />);
        expect(speciesFor).not.toHaveBeenCalled();
    });
});
