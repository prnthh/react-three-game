import { Box3 } from 'three';

export interface ChunkTree {
    bounds: Box3;
    indices: number[];
    children: ChunkTree[];
}

const branch = (): ChunkTree => ({ bounds: new Box3(), indices: [], children: [] });

/** Link the planner's occupied loose octants to their parents. Oversized chunks
 * stay at their authored octree level, alongside any finer occupied descendants. */
export function buildChunkTree(entries: readonly { bounds: Box3; cellKey: string }[]): ChunkTree {
    const root = branch();
    const levels = new Map<number, Map<string, ChunkTree>>();
    let top = 0;
    function get(level: number, coordinates: string) {
        let nodes = levels.get(level);
        if (!nodes) levels.set(level, nodes = new Map());
        let node = nodes.get(coordinates);
        if (!node) nodes.set(coordinates, node = branch());
        return node;
    }
    entries.forEach(({ bounds, cellKey }, i) => {
        const [levelText, coordinates] = cellKey.split('/');
        const level = Number(levelText);
        const node = get(level, coordinates);
        node.indices.push(i);
        node.bounds.union(bounds);
        const extent = Math.max(...coordinates.split(',').map(Number).map(Math.abs));
        top = Math.max(top, level + Math.ceil(Math.log2(extent + 1)));
    });
    for (let level = 0; level <= top; level++) {
        const nodes = levels.get(level);
        if (!nodes) continue;
        for (const [coordinates, node] of nodes) {
            const parent = level === top ? root : get(level + 1, coordinates.split(',').map(n => Math.floor(Number(n) / 2)).join(','));
            parent.bounds.union(node.bounds);
            parent.children.push(!node.indices.length && node.children.length === 1 ? node.children[0] : node);
        }
    }
    return root.children.length === 1 ? root.children[0] : root;
}

export function visitChunkTree(tree: ChunkTree, intersects: (bounds: Box3) => boolean, visit: (index: number) => void) {
    if (!intersects(tree.bounds)) return;
    for (const i of tree.indices) visit(i);
    for (const child of tree.children) visitChunkTree(child, intersects, visit);
}
