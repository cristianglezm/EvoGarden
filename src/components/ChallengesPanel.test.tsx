import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { ChallengesPanel } from './ChallengesPanel';
import { useChallengeStore } from '../stores/challengeStore';
import type { Challenge } from '../types';

// Initial state for the store before each test
const initialChallenges: Challenge[] = [
    { id: 'survival-1', title: 'Budding Survivor', description: 'Survive 100 ticks.', goal: 100, progress: 50, completed: false, metric: 'maxFlowerAge', aggregator: 'max' },
    { id: 'predation-1', title: 'First Hunt', description: 'Eat 10 insects.', goal: 10, progress: 10, completed: true, metric: 'totalInsectsEaten', aggregator: 'sum' },
];

describe('ChallengesPanel', () => {
    beforeEach(() => {
        // Reset the store to a consistent state before each test
        act(() => {
            useChallengeStore.setState({ challenges: initialChallenges });
        });
    });

    it('renders all challenges from the store', () => {
        render(<ChallengesPanel />);
        
        expect(screen.getByText('Budding Survivor')).toBeInTheDocument();
        expect(screen.getByText('Survive 100 ticks.')).toBeInTheDocument();

        expect(screen.getByText('First Hunt')).toBeInTheDocument();
        expect(screen.getByText('Eat 10 insects.')).toBeInTheDocument();
    });

    it('displays a progress bar and text for an incomplete challenge', () => {
        render(<ChallengesPanel />);
        
        const progressBar = screen.getByRole('progressbar', { name: /Progress for Budding Survivor/i });
        expect(progressBar).toBeInTheDocument();
        expect(progressBar).toHaveAttribute('aria-valuenow', '50');
        expect(progressBar).toHaveAttribute('aria-valuemax', '100');

        const progressBarFill = progressBar.querySelector('.bg-accent-green');
        expect(progressBarFill).toBeInTheDocument();
        expect(progressBarFill).toHaveStyle('width: 50%');

        expect(screen.getByText('50 / 100')).toBeInTheDocument();
    });

    it('displays a checkmark and no progress bar for a completed challenge', () => {
        render(<ChallengesPanel />);

        const completedChallengeContainer = screen.getByText('First Hunt').closest('div');
        expect(completedChallengeContainer).toBeInTheDocument();
        
        expect(within(completedChallengeContainer!).getByTestId('CheckIcon')).toBeInTheDocument();
        expect(within(completedChallengeContainer!).queryByRole('progressbar')).not.toBeInTheDocument();
        
        expect(screen.getByText('10 / 10')).toBeInTheDocument();
    });
    
    it('renders nothing inside the main div if there are no challenges', () => {
        act(() => {
            useChallengeStore.setState({ challenges: [] });
        });
        const { container } = render(<ChallengesPanel />);
        // The container should have a single div with space-y-4, but no children inside it
        expect(container.firstChild!.childNodes.length).toBe(0);
    });
});
