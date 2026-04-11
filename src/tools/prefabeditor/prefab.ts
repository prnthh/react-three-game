import { getComponentAssetRefs, getComponentDef } from './components/ComponentRegistry';
import type { ComponentData, GameObject, Prefab } from './types';

export type PrefabNodeRecord = Omit<GameObject, 'children'>;
export type PrefabAssetRefCounts = Record<string, number>;

export interface PrefabState {
    prefabId?: string;
    prefabName?: string;
    rootId: string;
    nodesById: Record<string, PrefabNodeRecord>;
    childIdsById: Record<string, string[]>;
    parentIdById: Record<string, string | null>;
    revision: number;
    assetManifestKey: string;
    assetRefCounts: PrefabAssetRefCounts;
}

function clonePrefabValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(item => clonePrefabValue(item)) as T;
    }

    if (value && typeof value === 'object') {
        const clone: Record<string, unknown> = {};

        Object.entries(value).forEach(([key, entry]) => {
            clone[key] = clonePrefabValue(entry);
        });

        return clone as T;
    }

    return value;
}

function createComponentMap(components: Record<string, { type: string; properties?: Record<string, any> }>) {
    const componentMap: Record<string, ComponentData> = {
        transform: createComponentData('Transform'),
    };

    Object.entries(components).forEach(([key, component]) => {
        componentMap[key] = createComponentData(component.type, component.properties);
    });

    return componentMap;
}

function getNodeNameFromPath(path: string, name?: string) {
    return name ?? path.replace(/^.*[\/]/, '').replace(/\.[^.]+$/, '');
}

function getAssetManifestKey(assetRefCounts: PrefabAssetRefCounts) {
    return Object.keys(assetRefCounts).sort().join('|');
}

function sameStringArrays(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function getAssetRefs(node?: Pick<GameObject, 'components'> | null) {
    const refs: string[] = [];

    Object.values(node?.components ?? {}).forEach(component => {
        if (!component?.type) return;

        for (const ref of getComponentAssetRefs(component.type, component.properties ?? {})) {
            refs.push(`${ref.type}:${ref.path}`);
        }
    });

    return refs.sort();
}

function addAssetRefs(assetRefCounts: PrefabAssetRefCounts, refs: string[]) {
    refs.forEach(ref => {
        assetRefCounts[ref] = (assetRefCounts[ref] ?? 0) + 1;
    });
}

function removeAssetRefs(assetRefCounts: PrefabAssetRefCounts, refs: string[]) {
    refs.forEach(ref => {
        const nextCount = (assetRefCounts[ref] ?? 0) - 1;
        if (nextCount > 0) {
            assetRefCounts[ref] = nextCount;
            return;
        }

        delete assetRefCounts[ref];
    });
}

function createAssetRefCounts(nodesById: Record<string, PrefabNodeRecord>) {
    const assetRefCounts: PrefabAssetRefCounts = {};
    Object.values(nodesById).forEach(node => addAssetRefs(assetRefCounts, getAssetRefs(node)));
    return assetRefCounts;
}

function denormalizeNode(
    id: string,
    nodesById: Record<string, PrefabNodeRecord>,
    childIdsById: Record<string, string[]>,
): GameObject {
    const node = nodesById[id];
    return {
        ...node,
        children: (childIdsById[id] ?? []).map(childId => denormalizeNode(childId, nodesById, childIdsById)),
    };
}

export function createDefaultComponentProperties(type: string): Record<string, any> {
    return clonePrefabValue(getComponentDef(type)?.defaultProperties ?? {});
}

export function createComponentData(type: string, properties?: Record<string, any>): ComponentData {
    return {
        type,
        properties: properties ? clonePrefabValue(properties) : createDefaultComponentProperties(type),
    };
}

export function createNode(
    name: string,
    components: Record<string, { type: string; properties?: Record<string, any> }> = {},
    options?: { id?: string; children?: GameObject[] },
): GameObject {
    return {
        id: options?.id ?? crypto.randomUUID(),
        name,
        components: createComponentMap(components),
        ...(options?.children ? { children: options.children } : null),
    };
}

export function createEmptyNode(name = 'New Node'): GameObject {
    return createNode(name);
}

export function createEmptyPrefab(): Prefab {
    return {
        id: crypto.randomUUID(),
        name: 'New Prefab',
        root: createNode('Root', {}, { id: crypto.randomUUID(), children: [] }),
    };
}

export function createModelNode(filename: string, name?: string): GameObject {
    return createNode(getNodeNameFromPath(filename, name), {
        model: {
            type: 'Model',
            properties: {
                filename,
                instanced: false,
                repeat: false,
                repeatAxes: [{ axis: 'x', count: 1, offset: 1 }],
            },
        },
    });
}

export function createImageNode(texturePath: string, name?: string): GameObject {
    return createNode(getNodeNameFromPath(texturePath, name), {
        geometry: {
            type: 'Geometry',
            properties: { geometryType: 'plane', args: [1, 1] },
        },
        material: {
            type: 'Material',
            properties: { color: '#ffffff', texture: texturePath },
        },
    });
}

export function normalizePrefab(prefab: Prefab, revision = 0): PrefabState {
    const nodesById: Record<string, PrefabNodeRecord> = {};
    const childIdsById: Record<string, string[]> = {};
    const parentIdById: Record<string, string | null> = {};

    insertSubtree(prefab.root, null, nodesById, childIdsById, parentIdById);

    const assetRefCounts = createAssetRefCounts(nodesById);

    return {
        prefabId: prefab.id,
        prefabName: prefab.name,
        rootId: prefab.root.id,
        nodesById,
        childIdsById,
        parentIdById,
        revision,
        assetManifestKey: getAssetManifestKey(assetRefCounts),
        assetRefCounts,
    };
}

export function createPrefabPatch(
    state: PrefabState,
    patch: Partial<PrefabState>,
    nextAssetRefCounts = state.assetRefCounts,
): Partial<PrefabState> {
    const assetRefsChanged = nextAssetRefCounts !== state.assetRefCounts;

    return {
        ...patch,
        revision: state.revision + 1,
        ...(assetRefsChanged ? {
            assetRefCounts: nextAssetRefCounts,
            assetManifestKey: getAssetManifestKey(nextAssetRefCounts),
        } : null),
    };
}

export function denormalizePrefab(
    state: Pick<PrefabState, 'prefabId' | 'prefabName' | 'rootId' | 'nodesById' | 'childIdsById'>,
): Prefab {
    return {
        id: state.prefabId,
        name: state.prefabName,
        root: denormalizeNode(state.rootId, state.nodesById, state.childIdsById),
    };
}

export function collectSubtreeIds(id: string, childIdsById: Record<string, string[]>) {
    const ids = [id];

    for (const childId of childIdsById[id] ?? []) {
        ids.push(...collectSubtreeIds(childId, childIdsById));
    }

    return ids;
}

export function insertSubtree(
    node: GameObject,
    parentId: string | null,
    nodesById: Record<string, PrefabNodeRecord>,
    childIdsById: Record<string, string[]>,
    parentIdById: Record<string, string | null>,
) {
    const { children, ...nodeRecord } = node;
    nodesById[node.id] = nodeRecord;
    childIdsById[node.id] = children?.map(child => child.id) ?? [];
    parentIdById[node.id] = parentId;

    children?.forEach(child => insertSubtree(child, node.id, nodesById, childIdsById, parentIdById));
}

export function cloneSubtree(
    id: string,
    parentId: string | null,
    source: Pick<PrefabState, 'nodesById' | 'childIdsById'>,
    nodesById: Record<string, PrefabNodeRecord>,
    childIdsById: Record<string, string[]>,
    parentIdById: Record<string, string | null>,
): string | null {
    const originalNode = source.nodesById[id];
    if (!originalNode) return null;

    const clonedId = crypto.randomUUID();
    const clonedNode: PrefabNodeRecord = {
        ...originalNode,
        id: clonedId,
        name: `${originalNode.name ?? originalNode.id} Copy`,
    };

    nodesById[clonedId] = clonedNode;
    parentIdById[clonedId] = parentId;

    const clonedChildIds = (source.childIdsById[id] ?? [])
        .map(childId => cloneSubtree(childId, clonedId, source, nodesById, childIdsById, parentIdById))
        .filter((childId): childId is string => Boolean(childId));

    childIdsById[clonedId] = clonedChildIds;
    return clonedId;
}

export function isDescendant(id: string, potentialAncestorId: string, parentIdById: Record<string, string | null>) {
    let currentId: string | null | undefined = id;

    while (currentId) {
        if (currentId === potentialAncestorId) return true;
        currentId = parentIdById[currentId];
    }

    return false;
}

export function updateAssetRefsForNodeChange(
    assetRefCounts: PrefabAssetRefCounts,
    currentNode: PrefabNodeRecord,
    nextNode: PrefabNodeRecord,
) {
    const currentRefs = getAssetRefs(currentNode);
    const nextRefs = getAssetRefs(nextNode);

    if (sameStringArrays(currentRefs, nextRefs)) {
        return assetRefCounts;
    }

    const nextAssetRefCounts = { ...assetRefCounts };
    removeAssetRefs(nextAssetRefCounts, currentRefs);
    addAssetRefs(nextAssetRefCounts, nextRefs);
    return nextAssetRefCounts;
}

export function collectSubtreeAssetRefs(node: GameObject): string[] {
    const refs = getAssetRefs(node);
    node.children?.forEach(child => refs.push(...collectSubtreeAssetRefs(child)));
    return refs;
}

export function collectAssetRefsForIds(ids: string[], nodesById: Record<string, PrefabNodeRecord>) {
    return ids.reduce<string[]>((refs, id) => {
        refs.push(...getAssetRefs(nodesById[id]));
        return refs;
    }, []);
}