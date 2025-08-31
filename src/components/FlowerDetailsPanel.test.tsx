import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlowerDetailsPanel } from './FlowerDetailsPanel';
import type { Flower } from '../types';
import { flowerService } from '../services/flowerService';

// Mock the flower service
vi.mock('../services/flowerService', () => ({
    flowerService: {
        draw3DFlower: vi.fn(),
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
    render(<FlowerDetailsPanel flower={null} isRunning={false} setIsRunning={mockSetIsRunning} />);
    expect(screen.getByText(/Select a flower on the grid/i)).toBeInTheDocument();
  });

  it('renders all flower details correctly when a flower is provided', () => {
    render(<FlowerDetailsPanel flower={mockFlower} isRunning={false} setIsRunning={mockSetIsRunning} />);
    
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
  });

  it('copies genome to clipboard when copy button is clicked', async () => {
    render(<FlowerDetailsPanel flower={mockFlower} isRunning={false} setIsRunning={mockSetIsRunning} />);
    
    const copyButton = screen.getByTitle('Copy genome');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockFlower.genome);
    });

    // Check for visual feedback (check icon appears)
    expect(await screen.findByTestId('CheckIcon')).toBeInTheDocument();
  });
  
  it('opens 3D viewer modal when "View in 3D" is clicked', async () => {
    vi.mocked(flowerService.draw3DFlower).mockResolvedValue('<gltf-string>');
    
    render(<FlowerDetailsPanel flower={mockFlower} isRunning={true} setIsRunning={mockSetIsRunning} />);
    
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
