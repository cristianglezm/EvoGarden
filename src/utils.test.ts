import { describe, it, expect } from 'vitest';
import { getInsectEmoji } from './utils';

describe('getInsectEmoji', () => {
    const insectEmojis = ['🦋', '🐛', '🐌', '🐞', '🐝'];

    it('should return a valid emoji from the list', () => {
        const emoji = getInsectEmoji('insect-123');
        expect(insectEmojis).toContain(emoji);
    });

    it('should be deterministic, always returning the same emoji for the same ID', () => {
        const id = 'some-consistent-id';
        const emoji1 = getInsectEmoji(id);
        const emoji2 = getInsectEmoji(id);
        expect(emoji1).toBe(emoji2);
    });

    it('should handle different IDs', () => {
        const emoji1 = getInsectEmoji('id-a');
        const emoji2 = getInsectEmoji('id-b');
        // This test just ensures it runs without error, the output might be the same
        // due to hash collision, which is acceptable.
        expect(insectEmojis).toContain(emoji1);
        expect(insectEmojis).toContain(emoji2);
    });

    it('should handle empty string ID', () => {
        const emoji = getInsectEmoji('');
        expect(insectEmojis).toContain(emoji);
    });
});
