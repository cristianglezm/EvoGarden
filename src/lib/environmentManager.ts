import type { AppEvent, EnvironmentState, Season, SimulationParams, WeatherEventType } from '../types';

export function updateEnvironment(
    tick: number,
    params: SimulationParams,
    currentEnvironmentState: EnvironmentState,
    events: AppEvent[]
): EnvironmentState {
    const { seasonLengthInTicks, temperature, temperatureAmplitude, humidity, humidityAmplitude } = params;
    const { weatherEventChance, weatherEventMinDuration, weatherEventMaxDuration, heatwaveTempIncrease, coldsnapTempDecrease, heavyRainHumidityIncrease, droughtHumidityDecrease } = params;
    
    // Create a new state object to avoid mutations
    const newEnvironmentState = { ...currentEnvironmentState, currentWeatherEvent: { ...currentEnvironmentState.currentWeatherEvent } };

    // 1. Update seasonal cycle
    const seasonalProgress = (tick % seasonLengthInTicks) / seasonLengthInTicks;
    const angle = seasonalProgress * 2 * Math.PI;

    let seasonalTemp = temperature + Math.sin(angle) * temperatureAmplitude;
    let seasonalHumidity = humidity + Math.sin(angle) * humidityAmplitude;
    
    let season: Season;
    if (seasonalProgress < 0.25) season = 'Spring';
    else if (seasonalProgress < 0.5) season = 'Summer';
    else if (seasonalProgress < 0.75) season = 'Autumn';
    else season = 'Winter';
    
    newEnvironmentState.season = season;

    // 2. Update weather events
    const { currentWeatherEvent } = newEnvironmentState;
    if (currentWeatherEvent.duration > 0) {
        currentWeatherEvent.duration--;
        if (currentWeatherEvent.duration === 0) {
            events.push({ message: `The ${currentWeatherEvent.type} has ended.`, type: 'info', importance: 'low' });
            currentWeatherEvent.type = 'none';
        }
    } else {
        if (Math.random() < weatherEventChance) {
            const eventTypes: WeatherEventType[] = ['heatwave', 'coldsnap', 'heavyrain', 'drought'];
            currentWeatherEvent.type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            currentWeatherEvent.duration = Math.floor(Math.random() * (weatherEventMaxDuration - weatherEventMinDuration + 1)) + weatherEventMinDuration;
            events.push({ message: `A ${currentWeatherEvent.type} has begun!`, type: 'info', importance: 'high' });
        }
    }

    // 3. Apply event modifiers
    switch (currentWeatherEvent.type) {
        case 'heatwave':
            seasonalTemp += heatwaveTempIncrease;
            break;
        case 'coldsnap':
            seasonalTemp -= coldsnapTempDecrease;
            break;
        case 'heavyrain':
            seasonalHumidity += heavyRainHumidityIncrease;
            break;
        case 'drought':
            seasonalHumidity -= droughtHumidityDecrease;
            break;
    }

    // 4. Finalize and clamp values
    newEnvironmentState.currentTemperature = seasonalTemp;
    newEnvironmentState.currentHumidity = Math.max(0, Math.min(1, seasonalHumidity));

    return newEnvironmentState;
}
