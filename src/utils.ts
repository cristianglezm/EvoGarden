import { INSECT_GENOME_LENGTH } from "./constants";

const insectEmojis = ['🦋', '🐛', '🐌', '🐞', '🐝'];

export const getInsectEmoji = (insectId: string): string => {
    // Simple hash to get a consistent emoji for each insect
    const hash = insectId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return insectEmojis[hash % insectEmojis.length];
};

export const generateRandomInsectGenome = (): number[] => {
    return Array.from({ length: INSECT_GENOME_LENGTH }, () => (Math.random() * 2) - 1); // Weights between -1 and 1
};
