import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { LiveCommentary, createChatMessage } from '@cristianglezm/live-commentary-widget';
import '@cristianglezm/live-commentary-widget/style.css';
import { XIcon } from './icons';
import { useAnalyticsStore } from '../stores/analyticsStore';
import { useEventLogStore } from '../stores/eventLogStore';

interface AIChatPanelProps {
    isOpen: boolean;
    canvases: { bg: HTMLCanvasElement; fg: HTMLCanvasElement } | null;
    onClose: () => void;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ isOpen, canvases, onClose }) => {
    const commentaryConfig = useMemo(() => ({
        apiKey: 'not_required',
        model: 'ggml-org/SmolVLM-500M-Instruct-GGUF',
        captureInterval: 60,
        temperature: 1.0,
    }), []);

    const mergeCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Use state for context data so the widget receives updates via props re-render
    const [contextData, setContextData] = useState<Record<string, any>>({});

    useEffect(() => {
        // Subscribe to the analytics store to update context data continuously
        const unsub = useAnalyticsStore.subscribe((state) => {
            const history = state.history;
            if (history.length === 0) return;

            const current = history[history.length - 1];
            
            // Calculate trends (approx 10 seconds / ~40 ticks window)
            // This provides the AI with "rate of change" context to identify booms/busts
            const lookbackFrames = 40; 
            const pastIndex = Math.max(0, history.length - 1 - lookbackFrames);
            const past = history[pastIndex];

            // Helper to format signed trend
            const fmtTrend = (curr: number, prev: number) => {
                const diff = curr - prev;
                return diff > 0 ? `${curr} (+${diff})` : diff < 0 ? `${curr} (${diff})` : `${curr}`;
            };

            // Calculate dominant insect
            const insectCounts: Record<string, number> = {
                'Butterfly': current.butterflies,
                'Caterpillar': current.caterpillars,
                'Beetle': current.beetles,
                'Ladybug': current.ladybugs,
                'Snail': current.snails,
                'Bee': current.bees,
                'Scorpion': current.scorpionCount,
                'Ant': current.antCount,
                'Spider': current.spiderCount,
                'Cockroach': current.cockroaches
            };
            
            let dominantInsect = 'None';
            let maxCount = -1;
            
            for (const [name, count] of Object.entries(insectCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    dominantInsect = name;
                }
            }

            // Fetch logs for the current tick to give granular event details
            const logEntries = useEventLogStore.getState().entries;
            const currentTickEvents = logEntries
                .filter(entry => entry.tick === current.tick)
                .map(entry => entry.message);

            // Update the context object. This triggers a re-render, passing new data to LiveCommentary.
            setContextData({
                tick: current.tick,
                season: current.season,
                weather: current.weatherEvent !== 'none' ? current.weatherEvent : 'Clear',
                
                environment: {
                    temp: `${current.currentTemperature?.toFixed(1)}C`,
                    humidity: `${((current.currentHumidity || 0) * 100).toFixed(0)}%`
                },
                
                population: {
                    flowers: fmtTrend(current.flowers, past.flowers),
                    insects: fmtTrend(current.insects, past.insects),
                    birds: fmtTrend(current.birds, past.birds),
                    dominant_species: `${dominantInsect} (${maxCount})`
                },
                
                events: {
                    insects_eaten: current.insectsEaten,
                    insects_born: current.insectsBorn + current.reproductions,
                    eggs_laid: current.eggsLaid,
                    feed: currentTickEvents // Pass specific event messages (e.g. "A bird ate an insect")
                },
                
                stats: {
                    avg_health: current.avgHealth.toFixed(1),
                    max_toxicity: `${(current.maxToxicity * 100).toFixed(0)}%`
                }
            });
        });

        return () => unsub();
    }, []);

    const prompts = useMemo(() => ({
        system: `You are EcoObserver, the nature documentary narrator for 'EvoGarden'.
Your goal is to provide immersive, insightful, and slightly dramatic commentary on this digital ecosystem.

Inputs:
1. An image of the garden grid (flowers, insects, birds).
2. A data object with current stats (season, weather, populations, events).

Guidelines:
- Persona: Think David Attenborough meets a data scientist.
- Focus: Predator-prey interactions, the struggle for resources, and the impact of the current season/weather.
- Trends: The population data includes a trend in parentheses, e.g., "15 (+5)". Use this to comment on rapid growth (blooms/swarms) or sudden collapses.
- Event Feed: You have access to a 'feed' of raw event logs in 'events.feed'. Use these specific details (e.g., "A bird hunted an insect", "A new champion was saved") to ground your commentary in immediate action.
- Format: Keep interval commentary punchy (1-2 sentences).
- Data Use: Weave the stats into the narrative. Don't just list numbers; explain what they mean for the ecosystem (e.g., "A population explosion of beetles threatens the flower reserves").
- If the scene looks static, describe it as a moment frozen in time, or focus on the layout of the territory.`,
        interval: `Provide a brief status update.
Check the data for:
- Current Weather/Season
- Significant Trends (population spikes or drops)
- Dominant Insect
- Specific events in the 'events.feed' list (e.g. predation, hatching, champions)

Combine this with visual observations (e.g., clustering of flowers, position of predators).
What is the most critical story happening right now?`,
        chat: `Viewer Question: "{{userPrompt}}"
Answer as EcoObserver, citing specific evidence from the visual or data feed (especially the event feed).`
    }), []);

    const captureSource = useCallback(() => {
        if (isOpen && canvases) {
            try {
                if (!mergeCanvasRef.current) {
                    mergeCanvasRef.current = document.createElement('canvas');
                }
                const merged = mergeCanvasRef.current;
                const { bg, fg } = canvases;
                
                // Downscale logic
                const MAX_WIDTH = 800; // Limit width to prevent massive payloads for VLM
                const scale = Math.min(1, MAX_WIDTH / bg.width);
                const targetWidth = Math.floor(bg.width * scale);
                const targetHeight = Math.floor(bg.height * scale);

                // Update merge canvas size if needed
                if (merged.width !== targetWidth || merged.height !== targetHeight) {
                    merged.width = targetWidth;
                    merged.height = targetHeight;
                }
                
                const ctx = merged.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, targetWidth, targetHeight);
                    // Draw source (full size) to destination (scaled size)
                    ctx.drawImage(bg, 0, 0, bg.width, bg.height, 0, 0, targetWidth, targetHeight);
                    ctx.drawImage(fg, 0, 0, fg.width, fg.height, 0, 0, targetWidth, targetHeight);
                    
                    // Use slightly lower quality to save bandwidth/tokens
                    return merged.toDataURL('image/jpeg', 0.6);
                }
            } catch (e) {
                console.error("Failed to capture canvas", e);
                return null;
            }
        }
        return null;
    }, [isOpen, canvases]);

    const handleResponseTransform = useCallback((rawText: string, img?: string) => {
        // We pass the captured image (img) as the attachment to enable "Show Context"
        return [createChatMessage(rawText, 'EcoObserver', undefined, undefined, img)];
    }, []);

    return (
        <aside className={`fixed top-0 right-0 h-full bg-surface z-40 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} w-full max-w-md shadow-2xl border-l border-tertiary/30 flex flex-col`}>
            <header className="flex items-center justify-between p-2 bg-background border-b border-tertiary/30 shrink-0">
                <h2 className="text-xl font-bold text-primary-light ml-2">Garden Observer</h2>
                <button 
                    onClick={onClose}
                    className="p-1 text-primary-light hover:bg-black/20 rounded-full transition-colors cursor-pointer"
                    aria-label="Close commentary panel"
                    title="Close"
                >
                    <XIcon className="w-6 h-6" />
                </button>
            </header>
            <div className="relative flex-grow overflow-hidden">
                <LiveCommentary
                    title=""
                    config={commentaryConfig}
                    prompts={prompts}
                    mode="external"
                    captureSource={captureSource}
                    showBadges={false}
                    contextData={contextData}
                    overlay={false}
                    responseTransform={handleResponseTransform}
                />
            </div>
        </aside>
    );
};
