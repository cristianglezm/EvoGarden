import React from 'react';
import { useChallengeStore } from '../stores/challengeStore';
import { CheckIcon } from './icons';

export const ChallengesPanel: React.FC = () => {
    const challenges = useChallengeStore(state => state.challenges);

    return (
        <div className="p-4 space-y-4">
            {challenges.map(challenge => (
                <div key={challenge.id} className={`p-3 rounded-lg transition-colors ${challenge.completed ? 'bg-accent-green/30' : 'bg-surface-hover/50'}`}>
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-primary">{challenge.title}</h4>
                        {challenge.completed && <CheckIcon className="w-5 h-5 text-tertiary" />}
                    </div>
                    <p className="text-sm text-secondary mt-1">{challenge.description}</p>
                    {!challenge.completed && (
                         <div
                            className="w-full bg-surface-hover rounded-full h-2.5 mt-2"
                            role="progressbar"
                            aria-label={`Progress for ${challenge.title}`}
                            aria-valuenow={challenge.progress}
                            aria-valuemin={0}
                            aria-valuemax={challenge.goal}
                         >
                             <div className="bg-accent-green h-2.5 rounded-full" style={{ width: `${Math.min(100, (challenge.progress / challenge.goal) * 100)}%` }}></div>
                         </div>
                    )}
                    <p className="text-xs text-right text-tertiary mt-1">{Math.min(challenge.progress, challenge.goal).toLocaleString()} / {challenge.goal.toLocaleString()}</p>
                </div>
            ))}
        </div>
    );
};
