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

        // All events go to the log unless mode is 'toasts' and importance is low
        const shouldLog = !(notificationMode === 'toasts' && event.importance === 'low');
        if (shouldLog) {
            useEventLogStore.getState().addEntry(event);
        }
        
        // Decide whether to show a toast
        const shouldToast = 
            (notificationMode === 'both') ||
            (notificationMode === 'toasts' && event.importance === 'high');

        if (shouldToast) {
            useToastStore.getState().addToast(event);
        }
    }
}

export const eventService = EventService.getInstance();
