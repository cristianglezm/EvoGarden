import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { ToolsPanel } from './ToolsPanel';
import { db } from '../services/db';
import type { SeedBankEntry } from '../types';
import { DEFAULT_SIM_PARAMS } from '../constants';

// Mock the db
vi.mock('../services/db', () => ({
  db: {
    seedBank: {
      toArray: vi.fn(),
    },
  },
}));

const mockChampions: SeedBankEntry[] = [
  { category: 'longestLived', genome: 'genome-long', value: 1000, imageData: 'img-long', sex: 'both' },
  { category: 'mostToxic', genome: 'genome-toxic', value: 0.9, imageData: 'img-toxic', sex: 'male' },
];

describe('ToolsPanel', () => {
  const mockOnClose = vi.fn();
  const mockTriggerWeatherEvent = vi.fn();
  const mockIntroduceSpecies = vi.fn();
  const mockIntroduceStationary = vi.fn();
  const mockOnEnterPlantingMode = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    params: DEFAULT_SIM_PARAMS,
    triggerWeatherEvent: mockTriggerWeatherEvent,
    introduceSpecies: mockIntroduceSpecies,
    introduceStationary: mockIntroduceStationary,
    onEnterPlantingMode: mockOnEnterPlantingMode,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.seedBank.toArray).mockResolvedValue(mockChampions);
  });

  it('renders correctly when open', async () => {
    render(<ToolsPanel {...defaultProps} />);
    expect(screen.getByText('Intervention Tools')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTitle('Plant longestLived')).toBeInTheDocument();
    });
  });

  it('is hidden when isOpen is false', () => {
    render(<ToolsPanel {...defaultProps} isOpen={false} />);
    const panel = screen.getByRole('complementary', { hidden: true });
    expect(panel).toHaveClass('translate-x-full');
  });

  it('calls onClose when the close button is clicked', async () => {
    render(<ToolsPanel {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close tools panel'));
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  describe('Plant a Champion', () => {
    it('displays loading state and then champion buttons', async () => {
      render(<ToolsPanel {...defaultProps} />);
      expect(screen.getByText('Loading champions...')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTitle('Plant longestLived')).toBeInTheDocument();
        expect(screen.getByTitle('Plant mostToxic')).toBeInTheDocument();
      });
    });

    it('displays empty message if no champions are found', async () => {
      vi.mocked(db.seedBank.toArray).mockResolvedValue([]);
      render(<ToolsPanel {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('No champions saved in the Seed Bank.')).toBeInTheDocument();
      });
    });

    it('calls onEnterPlantingMode and onClose when a champion button is clicked', async () => {
      render(<ToolsPanel {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByTitle('Plant longestLived')).toBeInTheDocument();
      });
      await act(async () => {
        fireEvent.click(screen.getByTitle('Plant longestLived'));
      });
      expect(mockOnEnterPlantingMode).toHaveBeenCalledWith('genome-long', 'both');
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Introduce Actors', () => {
    it('allows selecting an actor and count', async () => {
      render(<ToolsPanel {...defaultProps} />);
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Actor'), { target: { value: '🐌' } });
        fireEvent.change(screen.getByLabelText('Count'), { target: { value: '3' } });
      });
      expect(screen.getByLabelText('Actor')).toHaveValue('🐌');
      expect(screen.getByLabelText('Count')).toHaveValue(3);
    });

    it('calls introduceSpecies for a standard insect', async () => {
      render(<ToolsPanel {...defaultProps} />);
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Actor'), { target: { value: '🐌' } });
        fireEvent.change(screen.getByLabelText('Count'), { target: { value: '7' } });
      });
      const actionButton = screen
        .getAllByRole('button', { name: 'Introduce Actors' })
        .find(btn => !btn.hasAttribute('aria-expanded'));
      await act(async () => {
        fireEvent.click(actionButton!);
      });
      expect(mockIntroduceSpecies).toHaveBeenCalledWith('🐌', 7);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls introduceStationary for a hive', async () => {
      render(<ToolsPanel {...defaultProps} />);
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Actor'), { target: { value: '🛖' } });
        fireEvent.change(screen.getByLabelText('Count'), { target: { value: '2' } });
      });
      const actionButton = screen
        .getAllByRole('button', { name: 'Introduce Actors' })
        .find(btn => !btn.hasAttribute('aria-expanded'));
      await act(async () => {
        fireEvent.click(actionButton!);
      });
      expect(mockIntroduceStationary).toHaveBeenCalledWith('hive', 2);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Trigger Weather', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls triggerWeatherEvent and enters cooldown', async () => {
      const { rerender } = render(<ToolsPanel {...defaultProps} />);
      const heatwaveButton = screen.getByRole('button', { name: 'Heatwave' });
      expect(heatwaveButton).toBeEnabled();

      await act(async () => {
        fireEvent.click(heatwaveButton);
      });
      expect(mockTriggerWeatherEvent).toHaveBeenCalledWith('heatwave');
      expect(mockOnClose).toHaveBeenCalledTimes(1);

      rerender(<ToolsPanel {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Heatwave' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Coldsnap' })).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(30000);
      });
      rerender(<ToolsPanel {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Heatwave' })).toBeEnabled();
    });
  });
});
