import { NavigationMesh, type Point } from './navigation';

/** Moves along validated navigation segments; rendering only consumes this state. */
export class Walker {
    position: Point;
    heading = 0;
    moving = false;
    path: Point[] = [];
    private wait = 0;
    private random: () => number;
    constructor(readonly navigation: NavigationMesh, start: Point, readonly speed: number, seed: number) {
        this.position = [...start];
        this.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        if (navigation.triangleAt(start) < 0) throw Error('Walker must start on the navigation mesh');
    }
    update(delta: number) {
        let remaining = Math.min(Math.max(delta, 0), .1);
        if (this.wait > 0) { this.wait -= remaining; this.moving = false; return; }
        if (!this.path.length) {
            for (let attempt = 0; attempt < 24; attempt++) {
                const target = this.navigation.randomPoint(this.random);
                if (target[0] > 4 || target[0] < -11 || target[2] > 9 || target[2] < -8) continue;
                if (Math.hypot(target[0] - this.position[0], target[2] - this.position[2]) < 3) continue;
                this.path = this.navigation.findPath(this.position, target).slice(1);
                if (this.path.length) break;
            }
            if (!this.path.length) { this.wait = .5; this.moving = false; return; }
        }
        this.moving = true;
        while (remaining > 0 && this.path.length) {
            const next = this.path[0], dx = next[0] - this.position[0], dz = next[2] - this.position[2];
            const distance = Math.hypot(dx, dz), travel = remaining * this.speed;
            if (distance > .0001) this.heading = Math.atan2(dx, dz);
            if (travel >= distance) {
                this.position = [...next]; this.path.shift(); remaining -= distance / this.speed;
            } else {
                this.position[0] += dx / distance * travel; this.position[2] += dz / distance * travel; remaining = 0;
            }
        }
        if (!this.path.length) { this.wait = 1 + this.random() * 3; this.moving = false; }
    }
}
