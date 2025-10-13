import { useToastStore } from '../stores/toastStore';
import { useEventLogStore } from '../stores/eventLogStore';
import type { AppEvent, SimulationParams } from '../types';

class EventService {
    private static instance: EventService;
    private getParams: () => SimulationParams = () => { throw new Error('EventService not initialized'); };

    private constructor() {}

    public static getInstance(): EventService {
        if (!EventService.instance) {
            EventService.instance = new EventService();
        }
        return EventService.instance;
    }
    
    public initialize(getParams: () => SimulationParams) {
        this.getParams = getParams;
    }

    public dispatch(event: AppEvent) {
        const params = this.getParams();
        const { notificationMode } = params;

        // All events should always be added to the event log.
        useEventLogStore.getState().addEntry({ ...event, timestamp: Date.now() });
        
        // Decide whether to show a toast based on notification mode.
        const shouldToast = 
            (notificationMode === 'both') ||
            (notificationMode === 'toasts' && event.importance === 'high');

        if (shouldToast) {
            useToastStore.getState().addToast(event);
        }
    }
}

export const eventService = EventService.getInstance();
