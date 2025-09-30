import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInsectTick } from './insectBehavior';
import type { Insect, Cockroach } from '../../types';
import { DefaultInsectBehavior } from './specialized/DefaultInsectBehavior';
import { CockroachBehavior } from './specialized/CockroachBehavior';
import { CaterpillarBehavior } from './specialized/CaterpillarBehavior';
import { ButterflyBehavior } from './specialized/ButterflyBehavior';
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


describe('insectBehavior dispatcher', () => {
    const mockDefaultBehaviorUpdate = new DefaultInsectBehavior().update;
    const mockCockroachBehaviorUpdate = new CockroachBehavior().update;
    const mockCaterpillarBehaviorUpdate = new CaterpillarBehavior().update;
    const mockButterflyBehaviorUpdate = new ButterflyBehavior().update;
    const mockContext = {} as InsectBehaviorContext; // Context can be empty for this test

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should delegate to ButterflyBehavior for a butterfly (🦋)', () => {
        const butterfly: Insect = { emoji: '🦋' } as Insect;
        processInsectTick(butterfly, mockContext);
        expect(mockButterflyBehaviorUpdate).toHaveBeenCalledWith(butterfly, mockContext);
        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockCockroachBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockCaterpillarBehaviorUpdate).not.toHaveBeenCalled();
    });

    it('should delegate to CaterpillarBehavior for a caterpillar (🐛)', () => {
        const caterpillar: Insect = { emoji: '🐛' } as Insect;
        processInsectTick(caterpillar, mockContext);
        expect(mockCaterpillarBehaviorUpdate).toHaveBeenCalledWith(caterpillar, mockContext);
        expect(mockDefaultBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockCockroachBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockButterflyBehaviorUpdate).not.toHaveBeenCalled();
    });

    it('should delegate to DefaultInsectBehavior for a snail (🐌)', () => {
        const snail: Insect = { emoji: '🐌' } as Insect;
        processInsectTick(snail, mockContext);
        expect(mockDefaultBehaviorUpdate).toHaveBeenCalledWith(snail, mockContext);
        expect(mockCockroachBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockCaterpillarBehaviorUpdate).not.toHaveBeenCalled();
        expect(mockButterflyBehaviorUpdate).not.toHaveBeenCalled();
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
        expect(consoleWarnSpy).toHaveBeenCalledWith('No behavior defined for insect emoji: ❓');
        
        consoleWarnSpy.mockRestore();
    });
});
