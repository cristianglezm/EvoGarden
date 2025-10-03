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
    const mockOnStart = vi.fn();

    const defaultProps = {
        params: DEFAULT_SIM_PARAMS,
        onParamsChange: mockOnParamsChange,
        isRunning: false,
        setIsRunning: mockSetIsRunning,
        onSave: mockOnSave,
        onLoad: mockOnLoad,
        hasSavedState: false,
        isSaving: false,
        onStart: mockOnStart,
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
        expect(screen.getByLabelText(/Base Temperature/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.temperature));
        expect(screen.getByLabelText(/Base Humidity/i)).toHaveValue(String(DEFAULT_SIM_PARAMS.humidity));
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

    it('updates multiple local state values and applies them', () => {
        render(<Controls {...defaultProps} />);
    
        fireEvent.change(screen.getByLabelText(/Flowers/i), { target: { value: '50' } });
        fireEvent.change(screen.getByLabelText(/Insects/i), { target: { value: '25' } });
        fireEvent.change(screen.getByLabelText(/Base Temperature/i), { target: { value: '30' } });
        
        fireEvent.click(screen.getByRole('button', { name: /Apply & Reset/i }));
    
        expect(mockOnParamsChange).toHaveBeenCalledWith(expect.objectContaining({
            initialFlowers: 50,
            initialInsects: 25,
            temperature: 30,
        }));
    });
    
    it('updates select input value and applies it', () => {
        render(<Controls {...defaultProps} />);
        
        fireEvent.change(screen.getByLabelText(/Wind Direction/i), { target: { value: 'NW' } });
        
        fireEvent.click(screen.getByRole('button', { name: /Apply & Reset/i }));
        
        expect(mockOnParamsChange).toHaveBeenCalledWith(expect.objectContaining({
            windDirection: 'NW'
        }));
    });

    it('updates hive grid area and applies it', async () => {
        render(<Controls {...defaultProps} />);

        // Open the collapsible section
        fireEvent.click(screen.getByRole('button', { name: /Hive & Colony Rules/i }));
        
        // Check that the input is now visible
        const hiveGridInput = await screen.findByLabelText(/Hive Grid Area/i);
        expect(hiveGridInput).toBeVisible();

        // Change value and apply
        fireEvent.change(hiveGridInput, { target: { value: '15' } });
        fireEvent.click(screen.getByRole('button', { name: /Apply & Reset/i }));
        
        expect(mockOnParamsChange).toHaveBeenCalledWith(expect.objectContaining({
            hiveGridArea: 15
        }));
    });

    it('updates honeybee parameters and applies them', async () => {
        render(<Controls {...defaultProps} />);

        // Open the collapsible section
        fireEvent.click(screen.getByRole('button', { name: /Hive & Colony Rules/i }));
        
        // Wait for inputs to be visible and change them
        const dormancyInput = await screen.findByLabelText(/Bee Dormancy Temp/i);
        fireEvent.change(dormancyInput, { target: { value: '8' } });

        const honeyUseInput = await screen.findByLabelText(/Winter Honey Use/i);
        fireEvent.change(honeyUseInput, { target: { value: '0.02' } });

        const ratioInput = await screen.findByLabelText(/Pollen to Honey/i);
        fireEvent.change(ratioInput, { target: { value: '0.6' } });
        
        const thresholdInput = await screen.findByLabelText(/Hive Spawn Threshold/i);
        fireEvent.change(thresholdInput, { target: { value: '120' } });

        const costInput = await screen.findByLabelText(/Hive Spawn Cost/i);
        fireEvent.change(costInput, { target: { value: '25' } });
        
        const lifespanInput = await screen.findByLabelText(/Territory Mark Lifespan/i);
        fireEvent.change(lifespanInput, { target: { value: '150' } });

        const ttlInput = await screen.findByLabelText(/Signal TTL/i);
        fireEvent.change(ttlInput, { target: { value: '15' } });

        fireEvent.click(screen.getByRole('button', { name: /Apply & Reset/i }));
        
        expect(mockOnParamsChange).toHaveBeenCalledWith(expect.objectContaining({
            beeDormancyTemp: 8,
            beeWinterHoneyConsumption: 0.02,
            hivePollenToHoneyRatio: 0.6,
            hiveSpawnThreshold: 120,
            hiveSpawnCost: 25,
            territoryMarkLifespan: 150,
            signalTTL: 15,
        }));
    });
    
    it('disables Save button when simulation is running', () => {
        render(<Controls {...defaultProps} isRunning={true} />);
        expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
    });
    
    it('disables Load button when there is no saved state', () => {
        render(<Controls {...defaultProps} hasSavedState={false} />);
        expect(screen.getByRole('button', { name: /Load/i })).toBeDisabled();
    });
    
    it('enables Load button when there is a saved state', () => {
        render(<Controls {...defaultProps} hasSavedState={true} />);
        expect(screen.getByRole('button', { name: /Load/i })).toBeEnabled();
    });
    
    it('shows loading state on Save button when isSaving is true', () => {
        render(<Controls {...defaultProps} isSaving={true} />);
        const saveButton = screen.getByRole('button', { name: /Saving/i });
        expect(saveButton).toBeInTheDocument();
        expect(saveButton).toBeDisabled();
        expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
});
