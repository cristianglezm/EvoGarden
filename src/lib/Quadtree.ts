/**
 * Represents a point in 2D space with associated data.
 * @template T The type of data associated with the point.
 */
export interface Point<T> {
    x: number;
    y: number;
    data: T;
}

/**
 * Represents a rectangle defined by a center point and half-dimensions.
 */
export class Rectangle {
    x: number; // center x
    y: number; // center y
    hw: number; // half width
    hh: number; // half height

    constructor(x: number, y: number, hw: number, hh: number) {
        this.x = x;
        this.y = y;
        this.hw = hw;
        this.hh = hh;
    }

    /**
     * Checks if a point is contained within this rectangle.
     */
    contains(point: Point<any>): boolean {
        return (
            point.x >= this.x - this.hw &&
            point.x < this.x + this.hw &&
            point.y >= this.y - this.hh &&
            point.y < this.y + this.hh
        );
    }

    /**
     * Checks if another rectangle intersects with this one.
     */
    intersects(range: Rectangle): boolean {
        return !(
            range.x - range.hw > this.x + this.hw ||
            range.x + range.hw < this.x - this.hw ||
            range.y - range.hh > this.y + this.hh ||
            range.y + range.hh < this.y - this.hh
        );
    }
}

/**
 * A Quadtree data structure for efficient 2D spatial querying.
 * @template T The type of data the points in the quadtree will hold.
 */
export class Quadtree<T> {
    boundary: Rectangle;
    capacity: number;
    points: Point<T>[] = [];
    divided: boolean = false;
    northwest!: Quadtree<T>;
    northeast!: Quadtree<T>;
    southwest!: Quadtree<T>;
    southeast!: Quadtree<T>;

    constructor(boundary: Rectangle, capacity: number) {
        this.boundary = boundary;
        this.capacity = capacity > 0 ? capacity : 1;
    }

    private subdivide() {
        const { x, y, hw, hh } = this.boundary;
        const newHw = hw / 2;
        const newHh = hh / 2;

        const nw = new Rectangle(x - newHw, y - newHh, newHw, newHh);
        this.northwest = new Quadtree<T>(nw, this.capacity);
        const ne = new Rectangle(x + newHw, y - newHh, newHw, newHh);
        this.northeast = new Quadtree<T>(ne, this.capacity);
        const sw = new Rectangle(x - newHw, y + newHh, newHw, newHh);
        this.southwest = new Quadtree<T>(sw, this.capacity);
        const se = new Rectangle(x + newHw, y + newHh, newHw, newHh);
        this.southeast = new Quadtree<T>(se, this.capacity);
        
        this.divided = true;

        // Move existing points to the new children
        for (const p of this.points) {
            this.northwest.insert(p) || this.northeast.insert(p) || this.southwest.insert(p) || this.southeast.insert(p);
        }
        this.points = [];
    }

    /**
     * Inserts a point into the quadtree.
     * @returns `true` if the point was inserted, `false` otherwise.
     */
    insert(point: Point<T>): boolean {
        if (!this.boundary.contains(point)) {
            return false;
        }

        if (this.points.length < this.capacity && !this.divided) {
            this.points.push(point);
            return true;
        }
        
        if (!this.divided) {
            this.subdivide();
        }

        return (
            this.northwest.insert(point) ||
            this.northeast.insert(point) ||
            this.southwest.insert(point) ||
            this.southeast.insert(point)
        );
    }

    /**
     * Queries for points within a given rectangular range.
     * @param range The rectangular area to query.
     * @param found An optional array to accumulate results in.
     * @returns An array of points found within the range.
     */
    query(range: Rectangle, found: Point<T>[] = []): Point<T>[] {
        if (!this.boundary.intersects(range)) {
            return found;
        }

        for (const p of this.points) {
            if (range.contains(p)) {
                found.push(p);
            }
        }

        if (this.divided) {
            // Recursively query children only if the range intersects their boundaries.
            // This is a key optimization that the test is designed to verify.
            if (this.northwest.boundary.intersects(range)) {
                 this.northwest.query(range, found);
            }
            if (this.northeast.boundary.intersects(range)) {
                 this.northeast.query(range, found);
            }
            if (this.southwest.boundary.intersects(range)) {
                 this.southwest.query(range, found);
            }
            if (this.southeast.boundary.intersects(range)) {
                 this.southeast.query(range, found);
            }
        }
        
        return found;
    }
}
