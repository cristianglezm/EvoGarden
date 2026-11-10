import { INSECT_GENOME_LENGTH } from './constants';
import type { CellContent, Corpse, Insect } from './types';

const insectEmojis = ['🦋', '🐛', '🐌', '🐞', '🪲', '🦂', '🐝', '🐜', '🕷️', '🪳'];

export const getInsectEmoji = (insectId: string, options: { allowed?: string[]; exclude?: string[] } = {}): string => {
    let pool: string[];

    // If an `allowed` list is provided, filter it to only include actual insects.
    if (options.allowed !== undefined) {
        pool = options.allowed.filter(actor => insectEmojis.includes(actor));
    } else {
        // Otherwise, start with all emojis.
        pool = [...insectEmojis];
    }

    // Then filter by exclude list
    if (options.exclude && options.exclude.length > 0) {
        pool = pool.filter(e => !options.exclude!.includes(e));
    }

    if (pool.length === 0) return '';

    // Simple hash to get a consistent emoji for each insect
    const hash = insectId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return pool[hash % pool.length];
};

export const generateRandomInsectGenome = (): number[] => {
    return Array.from({ length: INSECT_GENOME_LENGTH }, () => Math.random() * 2 - 1); // Weights between -1 and 1
};

export const ACTOR_NAMES: Record<string, string> = {
    '🌸': 'Flower',
    '🦋': 'Butterfly',
    '🐛': 'Caterpillar',
    '🐌': 'Snail',
    '🐞': 'Ladybug',
    '🪲': 'Beetle',
    '🦂': 'Scorpion',
    '🐝': 'Honeybee',
    '🪳': 'Cockroach',
    '🐜': 'Ant',
    '🕷️': 'Spider',
    '🕸️': 'Spider Web',
    '🐦': 'Bird',
    '🦅': 'Eagle',
    '🥚': 'Egg',
    '💩': 'Nutrient',
    '✈️': 'Herbicide Plane',
    '💨': 'Herbicide Smoke',
    '🌱': 'Seed',
    '💀': 'Corpse',
    '⚪️': 'Cocoon',
    '🛖': 'Hive',
    '⛰️': 'Ant Colony',
    '💧': 'Slime Trail',
    '📍': 'Territory Mark',
    'Pheromone Trail': 'Pheromone Trail',
};

export const getActorName = (actor: CellContent): string => {
    switch (actor.type) {
        case 'insect': {
            const name = ACTOR_NAMES[(actor as Insect).emoji] || 'Insect';
            return `${(actor as Insect).emoji} ${name}`;
        }
        case 'cockroach':
            return `🪳 Cockroach`;
        case 'corpse': {
            const originalName = ACTOR_NAMES[(actor as Corpse).originalEmoji] || 'Creature';
            return `💀 Corpse (${originalName})`;
        }
        case 'flower':
            return `🌸 Flower`;
        case 'bird':
            return `🐦 Bird`;
        case 'eagle':
            return `🦅 Eagle`;
        case 'egg':
            return `🥚 Egg`;
        case 'nutrient':
            return `💩 Nutrient`;
        case 'herbicidePlane':
            return `✈️ Herbicide Plane`;
        case 'herbicideSmoke':
            return `💨 Herbicide Smoke`;
        case 'flowerSeed':
            return `🌱 Seed`;
        case 'cocoon':
            return `⚪️ Cocoon`;
        case 'slimeTrail':
            return `💧 Slime Trail`;
        case 'hive':
            return `🛖 Hive`;
        case 'territoryMark':
            return `📍 Territory Mark`;
        case 'antColony':
            return `⛰️ Ant Colony`;
        case 'pheromoneTrail':
            return `Pheromone Trail`;
        case 'spiderweb':
            return `🕸️ Spider Web`;
        default:
            return 'Unknown Entity';
    }
};

/**
 * Creates a shortened, human-readable ID from a full actor ID.
 * @param id The full actor ID string.
 * @returns A shortened ID string.
 */
export const getShortId = (id: string): string => {
    const parts = id.split('-');
    // Handles formats like:
    // insect-{type}-{x}-{y}-{timestamp} -> {type}-{x}-{y}-{ts}
    // flower-{x}-{y}-{timestamp} -> {x}-{y}-{ts}
    if (parts.length > 2) {
        const dataParts = parts.slice(1, parts.length - 1);
        const timestamp = parts[parts.length - 1];
        // Ensure timestamp is a number before slicing
        if (!isNaN(parseInt(timestamp, 10))) {
            return `${dataParts.join('-')}-${timestamp.slice(-2)}`;
        }
    }
    // Fallback for other ID formats
    return id.slice(-5);
};
