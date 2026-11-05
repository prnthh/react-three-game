export type Point = [number, number, number];
export type NavmeshData = { vertices: Point[]; triangles: [number, number, number][]; clearance: number };
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Paths and visibility are calculated solely from the separate Blender-authored surface. */
export class NavigationMesh {
    readonly centers: Point[];
    readonly neighbors: number[][];
    private buckets = new Map<string, number[]>();
    constructor(readonly data: NavmeshData) {
        this.centers = data.triangles.map(face => [0, 1, 2].map(axis => face.reduce((n, v) => n + data.vertices[v][axis], 0) / 3) as Point);
        this.neighbors = data.triangles.map(() => []);
        const edges = new Map<string, number>();
        data.triangles.forEach((face, index) => {
            for (let i = 0; i < 3; i++) {
                const a = face[i], b = face[(i + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
                const previous = edges.get(key);
                if (previous !== undefined) { this.neighbors[index].push(previous); this.neighbors[previous].push(index); }
                else edges.set(key, index);
            }
            const vertices = face.map(v => data.vertices[v]);
            for (let x = Math.floor(Math.min(...vertices.map(v => v[0]))); x <= Math.floor(Math.max(...vertices.map(v => v[0]))); x++) {
                for (let z = Math.floor(Math.min(...vertices.map(v => v[2]))); z <= Math.floor(Math.max(...vertices.map(v => v[2]))); z++) {
                    const key = `${x}:${z}`, bucket = this.buckets.get(key) ?? [];
                    bucket.push(index); this.buckets.set(key, bucket);
                }
            }
        });
    }
    private barycentric(point: Point, index: number) {
        const [a, b, c] = this.data.triangles[index].map(i => this.data.vertices[i]);
        const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        const u = ((b[2] - c[2]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[2] - c[2])) / denominator;
        const v = ((c[2] - a[2]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[2] - c[2])) / denominator;
        return [u, v, 1 - u - v];
    }
    triangleAt(point: Point) {
        return (this.buckets.get(`${Math.floor(point[0])}:${Math.floor(point[2])}`) ?? [])
            .find(index => this.barycentric(point, index).every(value => value >= -1e-7)) ?? -1;
    }
    /** Clip the full segment against triangles, then require continuous coverage. */
    canWalkSegment(a: Point, b: Point) {
        const candidates = new Set<number>();
        for (let x = Math.floor(Math.min(a[0], b[0])); x <= Math.floor(Math.max(a[0], b[0])); x++) {
            for (let z = Math.floor(Math.min(a[2], b[2])); z <= Math.floor(Math.max(a[2], b[2])); z++) {
                for (const index of this.buckets.get(`${x}:${z}`) ?? []) candidates.add(index);
            }
        }
        const intervals: [number, number][] = [];
        for (const index of candidates) {
            const from = this.barycentric(a, index), to = this.barycentric(b, index);
            let lower = 0, upper = 1;
            for (let i = 0; i < 3; i++) {
                const delta = to[i] - from[i];
                if (Math.abs(delta) < 1e-12) { if (from[i] < -1e-7) upper = -1; }
                else if (delta > 0) lower = Math.max(lower, (-1e-7 - from[i]) / delta);
                else upper = Math.min(upper, (-1e-7 - from[i]) / delta);
            }
            if (lower <= upper) intervals.push([lower, upper]);
        }
        intervals.sort((x, y) => x[0] - y[0]);
        let covered = 0;
        for (const [lower, upper] of intervals) {
            if (lower > covered + 1e-6) return false;
            covered = Math.max(covered, upper);
            if (covered >= 1 - 1e-6) return true;
        }
        return false;
    }
    findPath(start: Point, target: Point): Point[] {
        const from = this.triangleAt(start), to = this.triangleAt(target);
        if (from < 0 || to < 0) return [];
        if (this.canWalkSegment(start, target)) return [start, target];
        const costs = new Float64Array(this.centers.length).fill(Infinity);
        const parents = new Int32Array(this.centers.length).fill(-1);
        const closed = new Uint8Array(this.centers.length);
        const queue: { index: number; score: number }[] = [];
        const push = (index: number, score: number) => {
            let i = queue.length; queue.push({ index, score });
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (queue[parent].score <= score) break;
                queue[i] = queue[parent]; i = parent;
            }
            queue[i] = { index, score };
        };
        const pop = () => {
            const first = queue[0], last = queue.pop()!;
            if (queue.length) {
                let i = 0;
                while (i * 2 + 1 < queue.length) {
                    let child = i * 2 + 1;
                    if (child + 1 < queue.length && queue[child + 1].score < queue[child].score) child++;
                    if (queue[child].score >= last.score) break;
                    queue[i] = queue[child]; i = child;
                }
                queue[i] = last;
            }
            return first.index;
        };
        costs[from] = 0; push(from, 0);
        while (queue.length) {
            const current = pop();
            if (closed[current]) continue;
            if (current === to) break;
            closed[current] = 1;
            for (const next of this.neighbors[current]) {
                const cost = costs[current] + distance(this.centers[current], this.centers[next]);
                if (cost >= costs[next]) continue;
                costs[next] = cost; parents[next] = current;
                push(next, cost + distance(this.centers[next], this.centers[to]));
            }
        }
        if (parents[to] < 0) return [];
        const reversed: Point[] = [target];
        for (let current = to; current !== from; current = parents[current]) reversed.push(this.centers[current]);
        const path = [start, ...reversed.reverse()], smooth: Point[] = [start];
        let at = 0;
        while (at < path.length - 1) {
            let next = path.length - 1;
            while (next > at + 1 && !this.canWalkSegment(path[at], path[next])) next--;
            smooth.push(path[next]); at = next;
        }
        return smooth;
    }
    randomPoint(random = Math.random): Point {
        const face = this.data.triangles[Math.floor(random() * this.data.triangles.length)];
        const u = Math.sqrt(random()), v = random(), weights = [1 - u, u * (1 - v), u * v];
        return [0, 1, 2].map(axis => face.reduce((sum, index, i) => sum + this.data.vertices[index][axis] * weights[i], 0)) as Point;
    }
}
