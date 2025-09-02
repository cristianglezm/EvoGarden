import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Controls } from './Controls';
import { DEFAULT_SIM_PARAMS } from '../constants';

describe('Controls component', () => {
    const mockOnParamsChange = vi.fn();
    const mockSetIsRunning = vi.fn();
    const mockOnSave = vi.fn();
    const mockOnLoad = vi.fn();

    const defaultProps = {
        params: DEFAULT_SIM_PARAMS,
        onParamsChange: mockOnParamsChange,
        isRunning: false,
        setIsRunning: mockSetIsRunning,
        onSave: mockOnSave,
        onLoad: mockOnLoad,
        hasSavedState: false,
        isSaving: false,
    };

    beforeEach(() => {
        // Clear mocks before each test to ensure isolation
        vi.clearAllMocks();
    });

    it('renders all controls with initial values', () => {
        render(<Controls {...defaultProps} />);
        
        expect(screen.getByRole('button', { name: /Start simulation/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Apply & Reset/i })).toBeInTheDocument();
        
        // Check if sliders are rendered with correct default values
        expect(screen.getByLabelText(/Grid Width/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.gridWidth));
        expect(screen.getByLabelText(/Grid Height/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.gridHeight));
        expect(screen.getByLabelText(/Temperature/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.temperature));
        expect(screen.getByLabelText(/Humidity/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.humidity));
        expect(screen.getByLabelText(/Wind Strength/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.windStrength));
        expect(screen.getByLabelText(/Flowers/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.initialFlowers));
        expect(screen.getByLabelText(/Insects/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.initialInsects));
        expect(screen.getByLabelText(/Birds/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.initialBirds));
        
        // Check select element
        expect(screen.getByLabelText(/Wind Direction/i)).toHaveValue(DEFAULT_SIM_PARAMS.windDirection);
    });

    it('calls setIsRunning when start/pause button is clicked', () => {
        render(<Controls {...defaultProps} />);
        const startButton = screen.getByRole('button', { name: /Start simulation/i });
        fireEvent.click(startButton);
        expect(mockSetIsRunning).toHaveBeenCalledTimes(1);
    });

    it('displays "Pause" when isRunning is true', () => {
        render(<Controls {...defaultProps} isRunning={true} />);
        expect(screen.getByRole('button', { name: /Pause simulation/i })).toBeInTheDocument();
        expect(screen.getByText('Pause')).toBeInTheDocument();
    });
    
    it('calls onParamsChange with current params when Apply & Reset button is clicked without changes', () => {
        render(<Controls {...defaultProps} />);
        const applyButton = screen.getByRole('button', { name: /Apply & Reset/i });
        fireEvent.click(applyButton);
        expect(mockOnParamsChange).toHaveBeenCalledTimes(1);
        expect(mockOnParamsChange).toHaveBeenCalledWith(DEFAULT_SIM_PARAMS);
    });

    it('updates local state on input change and applies it on button click', () => {
        render(<Controls {...defaultProps} />);
        
        const gridWidthSlider = screen.getByLabelText(/Grid Width/i);
        fireEvent.change(gridWidthSlider, { target: { value: '15' } });
        
        const applyButton = screen.getByRole('button', { name: /Apply & Reset/i });
        fireEvent.click(applyButton);
        
        expect(mockOnParamsChange).toHaveBeenCalledTimes(1);
        expect(mockOnParamsChange).toHaveBeenCalledWith(expect.objectContaining({
            gridWidth: 15
        }));
    });
});
