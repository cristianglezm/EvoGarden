import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataPanel } from './DataPanel';

// Mock child components to isolate DataPanel's logic
vi.mock('./ChallengesPanel', () => ({
  ChallengesPanel: () => <div data-testid="challenges-panel-mock" />,
}));
vi.mock('./ChartsPanel', () => ({
  ChartsPanel: () => <div data-testid="charts-panel-mock" />,
}));

describe('DataPanel', () => {
  const mockOnClose = vi.fn();

  it('is visible when isOpen is true', () => {
    render(<DataPanel isOpen={true} onClose={mockOnClose} />);
    const panel = screen.getByRole('complementary'); // <aside> role
    expect(panel).toBeInTheDocument();
    expect(panel).not.toHaveClass('-translate-x-full');
    expect(panel).toHaveClass('translate-x-0');
  });

  it('is hidden when isOpen is false', () => {
    // Note: The component uses translate-x-full to hide, so it's still in the DOM.
    render(<DataPanel isOpen={false} onClose={mockOnClose} />);
    const panel = screen.getByRole('complementary');
    expect(panel).toHaveClass('-translate-x-full');
    expect(panel).not.toHaveClass('translate-x-0');
  });

  it('calls onClose when the close button is clicked', () => {
    mockOnClose.mockClear();
    render(<DataPanel isOpen={true} onClose={mockOnClose} />);
    
    const closeButton = screen.getByLabelText('Close data panel');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the overlay is clicked', () => {
    mockOnClose.mockClear();
    render(<DataPanel isOpen={true} onClose={mockOnClose} />);
    
    const panel = screen.getByRole('complementary');
    const overlay = panel.previousElementSibling;
    expect(overlay).not.toBeNull();

    fireEvent.click(overlay!);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('switches between Challenges and Analytics tabs', () => {
    render(<DataPanel isOpen={true} onClose={mockOnClose} />);

    const challengesTab = screen.getByRole('tab', { name: /Challenges/i });
    const analyticsTab = screen.getByRole('tab', { name: /Analytics/i });

    // Initially, Challenges should be active
    expect(challengesTab).toHaveAttribute('aria-selected', 'true');
    expect(analyticsTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('challenges-panel-mock')).toBeVisible();
    expect(screen.queryByTestId('charts-panel-mock')).not.toBeInTheDocument();

    // Click Analytics tab
    fireEvent.click(analyticsTab);

    // Now, Analytics should be active
    expect(challengesTab).toHaveAttribute('aria-selected', 'false');
    expect(analyticsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('challenges-panel-mock')).not.toBeInTheDocument();
    expect(screen.getByTestId('charts-panel-mock')).toBeVisible();

    // Click Challenges tab again
    fireEvent.click(challengesTab);
    
    // Should switch back
    expect(challengesTab).toHaveAttribute('aria-selected', 'true');
    expect(analyticsTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('challenges-panel-mock')).toBeVisible();
    expect(screen.queryByTestId('charts-panel-mock')).not.toBeInTheDocument();
  });
});
