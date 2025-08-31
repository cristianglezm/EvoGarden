
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Quadtree, Rectangle, Point } from './Quadtree';

describe('Quadtree', () => {
    let qt: Quadtree<{ id: number }>;
    let boundary: Rectangle;

    beforeEach(() => {
        boundary = new Rectangle(50, 50, 50, 50); // A 100x100 area centered at (50,50)
        qt = new Quadtree(boundary, 4);
    });

    describe('Insertion', () => {
        it('should insert a point within its boundary', () => {
            const p: Point<{ id: number }> = { x: 10, y: 10, data: { id: 1 } };
            expect(qt.insert(p)).toBe(true);
            expect(qt.points).toContain(p);
        });

        it('should not insert a point outside its boundary', () => {
            const p: Point<{ id: number }> = { x: 110, y: 110, data: { id: 1 } };
            expect(qt.insert(p)).toBe(false);
            expect(qt.points).not.toContain(p);
        });

        it('should not subdivide if capacity is not reached', () => {
            for (let i = 0; i < 4; i++) {
                qt.insert({ x: i, y: i, data: { id: i } });
            }
            expect(qt.points.length).toBe(4);
            expect(qt.divided).toBe(false);
        });

        it('should subdivide when capacity is exceeded', () => {
            for (let i = 0; i < 4; i++) {
                qt.insert({ x: i, y: i, data: { id: i } });
            }
            expect(qt.divided).toBe(false);
            // The 5th point should trigger subdivision
            qt.insert({ x: 5, y: 5, data: { id: 5 } });
            expect(qt.divided).toBe(true);
            expect(qt.points.length).toBe(0); // Points should be moved to children
        });

        it('should insert points into the correct sub-quadrants after dividing', () => {
            // Points to trigger subdivision
            const points = [
                { x: 10, y: 10, data: { id: 1 } }, // Northwest
                { x: 60, y: 10, data: { id: 2 } }, // Northeast
                { x: 10, y: 60, data: { id: 3 } }, // Southwest
                { x: 60, y: 60, data: { id: 4 } }, // Southeast
            ];
            points.forEach(p => qt.insert(p));
            
            // This point will trigger the subdivision
            qt.insert({ x: 5, y: 5, data: { id: 5 } }); 

            expect(qt.divided).toBe(true);
            expect(qt.northeast).toBeDefined();
            expect(qt.northwest).toBeDefined();
            expect(qt.southeast).toBeDefined();
            expect(qt.southwest).toBeDefined();

            // The original 4 points should now be in the children
            expect(qt.northwest.points.length).toBe(2); // (10,10) and (5,5)
            expect(qt.northeast.points.length).toBe(1);
            expect(qt.southwest.points.length).toBe(1);
            expect(qt.southeast.points.length).toBe(1);
        });
    });

    describe('Querying', () => {
        beforeEach(() => {
            const points: Point<{ id: number }>[] = [
                { x: 10, y: 10, data: { id: 1 } },
                { x: 20, y: 20, data: { id: 2 } },
                { x: 60, y: 60, data: { id: 3 } },
                { x: 70, y: 70, data: { id: 4 } },
                { x: 80, y: 80, data: { id: 5 } }, // This will cause subdivision
            ];
            points.forEach(p => qt.insert(p));
        });

        it('should return points within a given range', () => {
            const range = new Rectangle(15, 15, 10, 10); // Center (15,15), size 20x20
            const found = qt.query(range);
            expect(found.length).toBe(2);
            expect(found.map(p => p.data.id)).toEqual(expect.arrayContaining([1, 2]));
        });

        it('should return an empty array if no points are in range', () => {
            const range = new Rectangle(95, 95, 2, 2);
            const found = qt.query(range);
            expect(found.length).toBe(0);
        });

        it('should query from all relevant sub-quadrants', () => {
            const range = new Rectangle(50, 50, 50, 50); // The entire boundary
            const found = qt.query(range);
            expect(found.length).toBe(5);
        });
        
        it('should not query from quadrants that do not intersect the range', () => {
             // Create spies on the children's query methods
            const nwSpy = vi.spyOn(qt.northwest, 'query');
            const neSpy = vi.spyOn(qt.northeast, 'query');
            const swSpy = vi.spyOn(qt.southwest, 'query');
            const seSpy = vi.spyOn(qt.southeast, 'query');

            // This range only covers the southeast quadrant
            const range = new Rectangle(75, 75, 20, 20);
            qt.query(range);

            expect(nwSpy).not.toHaveBeenCalled();
            expect(neSpy).not.toHaveBeenCalled();
            expect(swSpy).not.toHaveBeenCalled();
            expect(seSpy).toHaveBeenCalled();
        });
        
        it('should handle range that perfectly matches a sub-quadrant', () => {
            const range = new Rectangle(25, 25, 25, 25); // Matches the northwest quadrant
            const found = qt.query(range);
            expect(found.length).toBe(2);
            expect(found.map(p => p.data.id)).toEqual(expect.arrayContaining([1, 2]));
        });
    });
    
    describe('Rectangle Helpers', () => {
        it('contains() should correctly identify if a point is inside', () => {
            const rect = new Rectangle(50, 50, 10, 10);
            expect(rect.contains({ x: 50, y: 50, data: null })).toBe(true);
            expect(rect.contains({ x: 40, y: 40, data: null })).toBe(true); // Edge
            expect(rect.contains({ x: 59, y: 59, data: null })).toBe(true); // Inner edge
            expect(rect.contains({ x: 60, y: 60, data: null })).toBe(false); // Outer edge
            expect(rect.contains({ x: 100, y: 100, data: null })).toBe(false);
        });

        it('intersects() should correctly identify overlapping rectangles', () => {
            const rect = new Rectangle(50, 50, 10, 10);
            const intersectingRect = new Rectangle(55, 55, 10, 10);
            const nonIntersectingRect = new Rectangle(80, 80, 10, 10);
            const containedRect = new Rectangle(50, 50, 5, 5);
            const containerRect = new Rectangle(50, 50, 20, 20);

            expect(rect.intersects(intersectingRect)).toBe(true);
            expect(rect.intersects(nonIntersectingRect)).toBe(false);
            expect(rect.intersects(containedRect)).toBe(true);
            expect(rect.intersects(containerRect)).toBe(true);
        });
    });
});
