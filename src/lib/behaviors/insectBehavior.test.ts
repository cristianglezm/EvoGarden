import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { processInsectTick } from './insectBehavior';
import type { Insect, Cockroach, CellContent } from '../../types';
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
vi.mock('./specialized/ScorpionBehavior', () => {
    const ScorpionBehavior = vi.fn();
    ScorpionBehavior.prototype.update = vi.fn();
    return { ScorpionBehavior };
});
vi.mock('./specialized/HoneybeeBehavior', () => {
    const HoneybeeBehavior = vi.fn();
    HoneybeeBehavior.prototype.update = vi.fn();
    return { HoneybeeBehavior };
});
vi.mock('./specialized/AntBehavior', () => {
    const AntBehavior = vi.fn();
    AntBehavior.prototype.update = vi.fn();
    return { AntBehavior };
});
vi.mock('./specialized/SpiderBehavior', () => {
    const SpiderBehavior = vi.fn();
    SpiderBehavior.prototype.update = vi.fn();
    return { SpiderBehavior };
});

describe('insectBehavior dispatcher', () => {
    let mockDefaultBehaviorUpdate: any;
    let mockCockroachBehaviorUpdate: any;
    let mockCaterpillarBehaviorUpdate: any;
    let mockButterflyBehaviorUpdate: any;
    let mockSnailBehaviorUpdate: any;
    let mockBeetleBehaviorUpdate: any;
    let mockLadybugBehaviorUpdate: any;
    let mockScorpionBehaviorUpdate: any;
    let mockHoneybeeBehaviorUpdate: any;
    let mockAntBehaviorUpdate: any;
    let mockSpiderBehaviorUpdate: any;

    const allMocks: any[] = [];

    const mockContext = {
        nextActorState: new Map<string, CellContent>(),
    } as InsectBehaviorContext;

    beforeAll(async () => {
        const { DefaultInsectBehavior } = await import('./specialized/DefaultInsectBehavior');
        const { CockroachBehavior } = await import('./specialized/CockroachBehavior');
        const { CaterpillarBehavior } = await import('./specialized/CaterpillarBehavior');
        const { ButterflyBehavior } = await import('./specialized/ButterflyBehavior');
        const { SnailBehavior } = await import('./specialized/SnailBehavior');
        const { BeetleBehavior } = await import('./specialized/BeetleBehavior');
        const { LadybugBehavior } = await import('./specialized/LadybugBehavior');
        const { ScorpionBehavior } = await import('./specialized/ScorpionBehavior');
        const { HoneybeeBehavior } = await import('./specialized/HoneybeeBehavior');
        const { AntBehavior } = await import('./specialized/AntBehavior');
        const { SpiderBehavior } = await import('./specialized/SpiderBehavior');
        
        mockDefaultBehaviorUpdate = new (DefaultInsectBehavior as any)().update;
        mockCockroachBehaviorUpdate = new (CockroachBehavior as any)().update;
        mockCaterpillarBehaviorUpdate = new (CaterpillarBehavior as any)().update;
        mockButterflyBehaviorUpdate = new (ButterflyBehavior as any)().update;
        mockSnailBehaviorUpdate = new (SnailBehavior as any)().update;
        mockBeetleBehaviorUpdate = new (BeetleBehavior as any)().update;
        mockLadybugBehaviorUpdate = new (LadybugBehavior as any)().update;
        mockScorpionBehaviorUpdate = new (ScorpionBehavior as any)().update;
        mockHoneybeeBehaviorUpdate = new (HoneybeeBehavior as any)().update;
        mockAntBehaviorUpdate = new (AntBehavior as any)().update;
        mockSpiderBehaviorUpdate = new (SpiderBehavior as any)().update;

        allMocks.push(
            mockDefaultBehaviorUpdate, mockCockroachBehaviorUpdate, mockCaterpillarBehaviorUpdate,
            mockButterflyBehaviorUpdate, mockSnailBehaviorUpdate, mockBeetleBehaviorUpdate,
            mockLadybugBehaviorUpdate, mockScorpionBehaviorUpdate, mockHoneybeeBehaviorUpdate,
            mockAntBehaviorUpdate, mockSpiderBehaviorUpdate
        );
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const testCases: { emoji: string, mockUpdate: () => any, type?: 'cockroach' }[] = [
        { emoji: '🦋', mockUpdate: () => mockButterflyBehaviorUpdate },
        { emoji: '🐛', mockUpdate: () => mockCaterpillarBehaviorUpdate },
        { emoji: '🐌', mockUpdate: () => mockSnailBehaviorUpdate },
        { emoji: '🐞', mockUpdate: () => mockLadybugBehaviorUpdate },
        { emoji: '🪲', mockUpdate: () => mockBeetleBehaviorUpdate },
        { emoji: '🦂', mockUpdate: () => mockScorpionBehaviorUpdate },
        { emoji: '🐝', mockUpdate: () => mockHoneybeeBehaviorUpdate },
        { emoji: '🐜', mockUpdate: () => mockAntBehaviorUpdate },
        { emoji: '🕷️', mockUpdate: () => mockSpiderBehaviorUpdate },
        { emoji: '🪳', mockUpdate: () => mockCockroachBehaviorUpdate, type: 'cockroach' },
    ];

    for (const { emoji, mockUpdate, type } of testCases) {
        it(`should delegate to the correct behavior for ${emoji}`, () => {
            const actor = { emoji, type: type || 'insect' } as Insect | Cockroach;
            processInsectTick(actor, mockContext);

            const expectedMock = mockUpdate();
            expect(expectedMock).toHaveBeenCalledWith(actor, mockContext);

            // Ensure no other behavior was called
            allMocks.filter(m => m !== expectedMock).forEach(m => {
                expect(m).not.toHaveBeenCalled();
            });
        });
    }

    it('should warn for unknown emoji and not call any behavior', () => {
        const unknownInsect: Insect = { emoji: '❓' } as Insect;
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        
        processInsectTick(unknownInsect, mockContext);

        allMocks.forEach(m => {
            expect(m).not.toHaveBeenCalled();
        });
        
        expect(consoleWarnSpy).toHaveBeenCalledWith('No behavior defined for insect emoji: ❓');
        
        consoleWarnSpy.mockRestore();
    });

    it('should do nothing if the insect is trapped', () => {
        const trappedInsect: Insect = { emoji: '🐛', isTrapped: true } as Insect;
        
        processInsectTick(trappedInsect, mockContext);

        allMocks.forEach(m => {
            expect(m).not.toHaveBeenCalled();
        });
    });
});
