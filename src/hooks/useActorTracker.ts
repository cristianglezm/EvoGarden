import { useState, useCallback, useRef, useEffect } from 'react';
import { eventService } from '../services/eventService';
import type { CellContent } from '../types';
import { getShortId } from '../utils';

interface UseActorTrackerProps {
    actors: Map<string, CellContent>;
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
    setSelectedActor: (actor: CellContent | null) => void;
    selectedActor: CellContent | null;
}

export const useActorTracker = ({ actors, isRunning, setIsRunning, setSelectedActor, selectedActor }: UseActorTrackerProps) => {
    const [trackedActorId, setTrackedActorId] = useState<string | null>(null);
    const wasRunningBeforeTrackingRef = useRef(false);

    const handleTrackActor = useCallback((id: string, actorType: string = 'actor') => {
        if (!id) {
            eventService.dispatch({ message: `Please enter an ID to track.`, type: 'error', importance: 'high' });
            return;
        }

        const actorToTrack = Array.from(actors.values()).find(a => a.id.toLowerCase().includes(id.toLowerCase()));

        if (actorToTrack) {
            wasRunningBeforeTrackingRef.current = isRunning;
            setTrackedActorId(actorToTrack.id);
            setIsRunning(true);
            eventService.dispatch({ message: `Tracking ${actorType} #${getShortId(actorToTrack.id)}`, type: 'info', importance: 'high' });
        } else {
            eventService.dispatch({ message: `${actorType} ID containing "${id}" not found.`, type: 'error', importance: 'high' });
        }
    }, [actors, isRunning, setIsRunning]);

    const handleStopTracking = useCallback(() => {
        if (trackedActorId) {
            const trackedActor = actors.get(trackedActorId);
            const actorType = trackedActor ? trackedActor.type : 'actor';
            eventService.dispatch({ message: `Stopped tracking ${actorType} #${getShortId(trackedActorId)}.`, type: 'info', importance: 'high' });
        }
        setTrackedActorId(null);
        setSelectedActor(null);
        setIsRunning(wasRunningBeforeTrackingRef.current);
    }, [trackedActorId, actors, setSelectedActor, setIsRunning]);

    useEffect(() => {
        if (trackedActorId) {
            const trackedActor = actors.get(trackedActorId);
            if (trackedActor) {
                // This effect will keep the details panel in sync with the tracked actor's state.
                // Only update if it's not already the selected one to prevent re-renders.
                if (selectedActor?.id !== trackedActorId || selectedActor !== trackedActor) {
                    setSelectedActor(trackedActor);
                }
            } else {
                // The tracked actor has disappeared (died).
                handleStopTracking(); // This will clean up state and notify the user.
            }
        }
    }, [actors, trackedActorId, selectedActor, setSelectedActor, handleStopTracking]);


    return {
        trackedActorId,
        handleTrackActor,
        handleStopTracking,
    };
};