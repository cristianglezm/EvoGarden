
const insectEmojis = ['🦋', '🐛', '🐌', '🐞', '🐝'];

export const getInsectEmoji = (insectId: string): string => {
    // Simple hash to get a consistent emoji for each insect
    const hash = insectId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return insectEmojis[hash % insectEmojis.length];
};
