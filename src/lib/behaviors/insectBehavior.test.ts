import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { processInsectTick } from './insectBehavior';
import type { Insect, Cockroach } from '../../types';
import type { InsectBehaviorContext } from './insectBehavior';

// Mock the specialized behavior modules
vi.mock('./specialized/DefaultInsectBehavior', () => {
    const DefaultInsectBehavior = vi.fn();
    DefaultInsectBehavior.prototype.update = vi.fn();
    return { DefaultInsectBehavior };
});

vi.mock('./specialized/CockroachBehavior', () => {
    const CockroachBehavior = vi.fn();
    CockroachBehavior.prototype.update = vi.fn();
    return { CockroachBehavior };
});

vi.mock('./specialized/CaterpillarBehavior', () => {
    const CaterpillarBehavior = vi.fn();
    CaterpillarBehavior.prototype.update = vi.fn();
    return { CaterpillarBehavior };
});

vi.mock('./specialized/ButterflyBehavior', () => {
    const ButterflyBehavior = vi.fn();
    ButterflyBehavior.prototype.update = vi.fn();
    return { ButterflyBehavior };
});

vi.mock('./specialized/SnailBehavior', () => {
    const SnailBehavior = vi.fn();
    SnailBehavior.prototype.update = vi.fn();
    return { SnailBehavior };
});

vi.mock('./specialized/BeetleBehavior', () => {
    const BeetleBehavior = vi.fn();
    BeetleBehavior.prototype.update = vi.fn();
    return { BeetleBehavior };
});

vi.mock('./specialized/LadybugBehavior', () => {
    const LadybugBehavior = vi.fn();
    LadybugBehavior.prototype.update = vi.fn();
    return { LadybugBehavior };
});


describe('insectBehavior dispatcher', () => {
    let mockDefaultBehaviorUpdate: any;
    let mockCockroachBehaviorUpdate: any;
    let mockCaterpillarBehaviorUpdate: any;
    let mockButterflyBehaviorUpdate: any;
    let mockSnailBehaviorUpdate: any;
    let mockBeetleBehaviorUpdate: any;
    let mockLadybugBehaviorUpdate: any;

    const mockContext = {} as InsectBehaviorContext; // Context can be empty for this test

    beforeAll(async () => {
        // We must import the mocks to get access to the mocked constructors/methods
        const { DefaultInsectBehavior } = await import('./specialized/DefaultInsectBehavior');
        const { CockroachBehavior } = await import('./specialized/CockroachBehavior');
        const { CaterpillarBehavior } = await import('./specialized/CaterpillarBehavior');
        const { ButterflyBehavior } = await import('./specialized/ButterflyBehavior');
        const { SnailBehavior } = await import('./specialized/SnailBehavior');
        const { BeetleBehavior } = await import('./specialized/BeetleBehavior');
        const { LadybugBehavior } = await import('./specialized/LadybugBehavior');

        mockDefaultBehaviorUpdate = new (DefaultInsectBehavior as any)().update;
        mockCockroachBehaviorUpdate = new (CockroachBehavior as any)().update;
        mockCaterpillarBehaviorUpdate = new (CaterpillarBehavior as any)().update;
        mockButterflyBehaviorUpdate = new (ButterflyBehavior as any)().update;
        mockSnailBehaviorUpdate = new (SnailBehavior as any)().update;
        mockBeetleBehaviorUpdate = new (BeetleBehavior as any)().update;
        mockLadybugBehaviorUpdate = new (LadybugBehavior as any)().update;
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should delegate to ButterflyBehavior for a butterfly (🦋)', () => {
        const butterfly: Insect = { emoji: '🦋' } as Insect;
        processInsectTick(butterfly, mockContext);
        expect(mockButterflyBehaviorUpdate).toHaveBeenCalledWith(butterfly, mockContext);
        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
    });

    it('should delegate to CaterpillarBehavior for a caterpillar (🐛)', () => {
        const caterpillar: Insect = { emoji: '🐛' } as Insect;
        processInsectTick(caterpillar, mockContext);
        expect(mockCaterpillarBehaviorUpdate).toHaveBeenCalledWith(caterpillar, mockContext);
        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
    });

    it('should delegate to SnailBehavior for a snail (🐌)', () => {
        const snail: Insect = { emoji: '🐌' } as Insect;
        processInsectTick(snail, mockContext);
        expect(mockSnailBehaviorUpdate).toHaveBeenCalledWith(snail, mockContext);
        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
    });

    it('should delegate to LadybugBehavior for a ladybug (🐞)', () => {
        const ladybug: Insect = { emoji: '🐞' } as Insect;
        processInsectTick(ladybug, mockContext);
        expect(mockLadybugBehaviorUpdate).toHaveBeenCalledWith(ladybug, mockContext);
        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
    });

    it('should delegate to BeetleBehavior for a beetle (🪲)', () => {
        const beetle: Insect = { emoji: '🪲' } as Insect;
        processInsectTick(beetle, mockContext);
        expect(mockBeetleBehaviorUpdate).toHaveBeenCalledWith(beetle, mockContext);
        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
    });

    it('should delegate to DefaultInsectBehavior for a bee (🐝)', () => {
        const bee: Insect = { emoji: '🐝' } as Insect;
        processInsectTick(bee, mockContext);
        expect(mockDefaultBehaviorUpdate).toHaveBeenCalledWith(bee, mockContext);
    });

    it('should delegate to CockroachBehavior for a cockroach (🪳)', () => {
        const cockroach: Cockroach = { emoji: '🪳', type: 'cockroach' } as Cockroach;
        processInsectTick(cockroach, mockContext);
        expect(mockCockroachBehaviorUpdate).toHaveBeenCalledWith(cockroach, mockContext);
        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
    });

    it('should not call any behavior for an unknown emoji', () => {
        const unknownInsect: Insect = { emoji: '❓' } as Insect;
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        
        processInsectTick(unknownInsect, mockContext);

        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockCockroachBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockCaterpillarBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockButterflyBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockSnailBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockLadybugBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockBeetleBehaviorUpdate).not.toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalledWith('No behavior defined for insect emoji: ❓');
        
        consoleWarnSpy.mockRestore();
    });
});
