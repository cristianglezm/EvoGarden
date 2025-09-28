import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlowerDetailsPanel } from './FlowerDetailsPanel';
import type { Flower } from '../types';
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
