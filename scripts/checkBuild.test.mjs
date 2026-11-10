// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { checkBuildAssets } from './checkBuild.mjs';

const good = [
    'index-DqIEDqC0.js',
    'index-BNTHZGj0.css',
    'vendor-D0YZ2T6h.js',
    'simulation.worker-BadE9L83.js',
    'flower.worker-CZzdLW4O.js',
    'species.worker-xSA0rgoD.js',
];

describe('checkBuildAssets', () => {
    it('finds nothing wrong with a build that has its three workers compiled', () => {
        expect(checkBuildAssets(good)).toEqual([]);
    });

    it('says which worker is missing', () => {
        expect(checkBuildAssets(good.filter(f => !f.startsWith('species')))).toEqual(['There is no compiled species worker (species.worker-*.js).']);
        expect(checkBuildAssets(good.filter(f => !f.startsWith('flower')))).toEqual(['There is no compiled flower worker (flower.worker-*.js).']);
        expect(checkBuildAssets(good.filter(f => !f.startsWith('simulation')))).toEqual(['There is no compiled simulation worker (simulation.worker-*.js).']);
    });

    it('says when a TypeScript file was copied as an asset instead of compiled: the browser cannot run it', () => {
        const broken = [...good.filter(f => !f.startsWith('flower')), 'flower.worker-xtHi_pOc.ts'];
        expect(checkBuildAssets(broken)).toEqual([
            'There is no compiled flower worker (flower.worker-*.js).',
            "A TypeScript file was copied as it is, not compiled: flower.worker-xtHi_pOc.ts. A worker is compiled only when it is created as new Worker(new URL('./x.ts', import.meta.url)) with the URL written inside the call.",
        ]);
    });

    it('does not take a .ts in the middle of a name for a source file', () => {
        expect(checkBuildAssets([...good, 'charts.tsx-data.js'])).toEqual([]);
    });

    it('reports a source file even when the worker is also there', () => {
        const problems = checkBuildAssets([...good, 'extra.worker-abc.tsx']);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('extra.worker-abc.tsx');
    });
});
