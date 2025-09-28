import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Trie } from '../lib/Trie';
import type { CellContent } from '../types';
import { SearchIcon, XIcon } from './icons';

interface GlobalSearchProps {
    actors: Map<string, CellContent>;
    onTrackActor: (id: string) => void;
    onStopTracking: () => void;
    onHighlightActor: (id: string | null) => void;
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
    trackedActorId: string | null;
}

const MAX_SUGGESTIONS = 16;

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ actors, onTrackActor, onStopTracking, onHighlightActor, isRunning, setIsRunning, trackedActorId }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isFocused, setIsFocused] = useState(false);
    const wasRunningBeforeSearchRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const actorTrie = useMemo(() => {
        const trie = new Trie();
        for (const id of actors.keys()) {
            trie.insert(id);
        }
        return trie;
    }, [actors]);

    const handleFocus = () => {
        if (!isFocused) {
            wasRunningBeforeSearchRef.current = isRunning;
            setIsRunning(false);
            setIsFocused(true);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value) {
            const results = actorTrie.search(value);
            setSuggestions(results.slice(0, MAX_SUGGESTIONS));
        } else {
            setSuggestions([]);
            onHighlightActor(null);
        }
    };
    
    const handleSelect = (id: string) => {
        setSearchTerm(id);
        onHighlightActor(id);
        setSuggestions([]);
        inputRef.current?.focus();
    };

    const handleTrackClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (searchTerm) {
            onTrackActor(searchTerm);
        }
        setSearchTerm('');
        setSuggestions([]);
        setIsFocused(false);
    };
    
    // Click outside handler
    const handleBlur = useCallback(() => {
        if (isFocused && !trackedActorId) {
            setSearchTerm('');
            setSuggestions([]);
            setIsFocused(false);
            onHighlightActor(null); // Clear highlight
            if (wasRunningBeforeSearchRef.current) {
                setIsRunning(true);
            }
        }
    }, [isFocused, trackedActorId, setIsRunning, onHighlightActor]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                handleBlur();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [handleBlur]);


    if (trackedActorId) {
        return (
             <div className="relative font-mono flex items-center">
                <input
                    type="text"
                    value={`Tracking: ${trackedActorId.substring(7, 12)}`}
                    disabled
                    className="bg-background text-xs rounded-l-md pl-2 pr-2 py-1 w-48 text-accent-yellow shadow-[inset_0_1px_1px_0_#000]"
                    aria-label="Currently tracking actor"
                />
                 <button
                    onClick={onStopTracking}
                    className="bg-accent-red/80 hover:bg-accent-red text-white p-1.5 rounded-r-md"
                    aria-label="Stop tracking actor"
                    title="Stop Tracking"
                >
                    <XIcon className="w-4 h-4" /> 
                </button>
            </div>
        )
    }

    return (
        <div className="relative font-mono" ref={containerRef}>
            <div className="relative flex items-center">
                <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    placeholder="Find Actor by ID..."
                    className="bg-background text-xs rounded-l-md pl-2 pr-2 py-1 w-48 focus:ring-1 focus:ring-accent-yellow focus:outline-none shadow-[inset_0_1px_1px_0_#000]"
                    aria-label="Find actor by ID"
                />
                 <button
                    onClick={handleTrackClick}
                    className="bg-accent-blue/50 hover:bg-accent-blue/70 text-white p-1.5 rounded-r-md disabled:bg-surface-hover/50 disabled:cursor-not-allowed"
                    aria-label="Track selected actor"
                    title="Track actor by ID"
                    disabled={!searchTerm || suggestions.length > 0}
                >
                    <SearchIcon className="w-4 h-4" /> 
                </button>
            </div>
            {isFocused && suggestions.length > 0 && (
                <ul className="absolute top-full mt-1 w-full bg-surface border border-border/50 rounded-md shadow-lg z-10 overflow-hidden" role="list">
                    {suggestions.map(id => (
                        <li key={id}>
                            <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSelect(id)}
                                className="w-full text-left px-3 py-1.5 text-xs text-secondary hover:bg-surface-hover transition-colors"
                            >
                                {id}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
