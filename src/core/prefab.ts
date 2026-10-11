import {
	getComponentDefaultProperties,
	getComponent,
} from "./ComponentRegistry.js";
import type { ComponentData, GameObject, MaterialComponentProperties, Prefab, PrefabMaterial } from "./types.js";

export type PrefabNodeRecord = Omit<GameObject, "children">;

export interface PrefabState {
	prefabId?: string;
	prefabName?: string;
    /** Derived lookup of packed nodes and inherited definitions; never serialized. */
    prefabs?: Record<string, Prefab>;
	/** Derived from component definitions for authoring tools; never persisted. */
	materials: Record<string, PrefabMaterial>;
	rootId: string;
	nodesById: Record<string, PrefabNodeRecord>;
	childIdsById: Record<string, string[]>;
	parentIdById: Record<string, string | null>;
}

export const DEFAULT_MATERIAL_ID = "default";

export function createDefaultMaterial(): PrefabMaterial {
	return {
		materialType: "standard",
		color: "#ffffff",
		toneMapped: true,
		wireframe: false,
		transparent: false,
		opacity: 1,
		metalness: 0,
		roughness: 1,
		sizeAttenuation: true,
		offset: [0, 0],
	};
}

const MATERIAL_DEFAULTS: Record<string, unknown> = {
	materialType: "standard",
	color: "#ffffff",
	toneMapped: true,
	wireframe: false,
	opacity: 1,
	alphaTest: 0,
	metalness: 0,
	roughness: 1,
	transmission: 0,
	thickness: 0,
	ior: 1.5,
	rotation: 0,
	sizeAttenuation: true,
	repeat: false,
	repeatCount: [1, 1],
	offset: [0, 0],
	generateMipmaps: true,
	minFilter: "LinearMipmapLinearFilter",
	magFilter: "LinearFilter",
	normalScale: [1, 1],
	side: "FrontSide",
};

/** @internal Compare prefab data by value, independently of object key order. */
export function samePrefabValue(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left) && Array.isArray(right) && left.length === right.length
			&& left.every((value, index) => samePrefabValue(value, right[index]));
	}

	if (left && right && typeof left === "object" && typeof right === "object") {
		const leftEntries = Object.entries(left);
		const rightRecord = right as Record<string, unknown>;
		return leftEntries.length === Object.keys(rightRecord).length
			&& leftEntries.every(([key, value]) => Object.hasOwn(rightRecord, key) && samePrefabValue(value, rightRecord[key]));
	}

	return left === right;
}

/** Remove values supplied by the runtime so serialized prefab JSON only stores intent. */
export function compactPrefabMaterial(material: PrefabMaterial): PrefabMaterial {
	const materialType = material.materialType ?? "standard";
	const defaults: Record<string, unknown> = {
		...MATERIAL_DEFAULTS,
		transparent: materialType === "sprite",
		depthTest: materialType !== "sprite",
		depthWrite: materialType !== "sprite",
	};
	const compact: Record<string, unknown> = {};

	Object.entries(material).forEach(([key, value]) => {
		if (value === undefined || samePrefabValue(value, defaults[key])) return;
		compact[key] = structuredClone(value);
	});

	return compact as PrefabMaterial;
}

/** Authored fields only: a name with no settings is a reference, not a definition. */
export const MATERIAL_FIELDS = [
    ...Object.keys(MATERIAL_DEFAULTS), 'transparent', 'depthTest', 'depthWrite', 'texture', 'normalMapTexture',
] as (keyof PrefabMaterial)[];

export function getMaterialDefinition(properties: MaterialComponentProperties): PrefabMaterial | null {
    let definition: Record<string, unknown> | null = null;
    for (const key of MATERIAL_FIELDS) {
        const value = properties[key];
        if (value === undefined || value === null || value === '') continue;
        (definition ??= {})[key] = value;
    }
    return definition as PrefabMaterial | null;
}

const materialDefinitionCache = new WeakMap<ComponentData, PrefabMaterial | null>();

/** Derive the authoring index from immutable document snapshots. */
export function collectMaterialDefinitions(nodes: Record<string, PrefabNodeRecord>): Record<string, PrefabMaterial> {
    const materials: Record<string, PrefabMaterial> = {};
    for (const node of Object.values(nodes)) for (const component of Object.values(node.components ?? {})) {
        if (component?.type !== 'Material') continue;
        const { name: materialName } = component.properties;
        if (!materialName || Object.hasOwn(materials, materialName)) continue;
        // Document edits replace components; unchanged snapshots share definitions.
        if (!materialDefinitionCache.has(component)) {
            materialDefinitionCache.set(component, getMaterialDefinition(component.properties));
        }
        const definition = materialDefinitionCache.get(component);
        if (!definition) continue;
        materials[materialName] = definition;
    }
    return materials;
}

function createComponentMap(
	components: Record<
		string,
		{ type: string; properties?: Record<string, any> }
	>,
) {
	const componentMap: Record<string, ComponentData> = {
		transform: createComponentData("Transform"),
	};

	Object.entries(components).forEach(([key, component]) => {
		componentMap[key] = createComponentData(
			component.type,
			component.properties,
		);
	});

	return componentMap;
}

function getNodeNameFromPath(path: string, name?: string) {
	return name ?? path.replace(/^.*[\/]/, "").replace(/\.[^.]+$/, "");
}

export function denormalizeNode(
	id: string,
	nodesById: Record<string, PrefabNodeRecord>,
	childIdsById: Record<string, string[]>,
): GameObject {
	const node = nodesById[id];
	const { components: _components, ...nodeProperties } = node;
	const components = Object.entries(node.components ?? {}).reduce<Record<string, ComponentData>>((result, [key, component]) => {
		if (!component) return result;
		const defaults = getComponentDefaultProperties(getComponent(component.type), component.properties);
		const properties = Object.entries(component.properties ?? {}).reduce<Record<string, unknown>>((sparse, [name, value]) => {
			if (!samePrefabValue(value, defaults[name])) sparse[name] = structuredClone(value);
			return sparse;
		}, {});
		result[key] = { ...component, properties };
		return result;
	}, {});
	const children = (childIdsById[id] ?? []).map((childId) =>
		denormalizeNode(childId, nodesById, childIdsById),
	);
	return {
		...nodeProperties,
		...(Object.keys(components).length > 0 ? { components } : null),
		...(children.length > 0 ? { children } : null),
	};
}

export function createComponentData(
	type: string,
	properties?: Record<string, any>,
): ComponentData {
	return {
		type,
		properties: structuredClone(properties ?? {}),
	};
}

export function createNode(
	name: string,
	components: Record<
		string,
		{ type: string; properties?: Record<string, any> }
	> = {},
	options?: { id?: string; children?: GameObject[] },
): GameObject {
	return {
		id: options?.id ?? crypto.randomUUID(),
		name,
		components: createComponentMap(components),
		...(options?.children ? { children: options.children } : null),
	};
}

export function createEmptyNode(name = "New Node"): GameObject {
	return createNode(name);
}

export function createEmptyPrefab(): Prefab {
	return {
		id: crypto.randomUUID(),
		name: "New Prefab",
		root: createNode("Root", {}, { id: crypto.randomUUID(), children: [] }),
	};
}

export function createModelNode(filename: string, name?: string): GameObject {
	return createNode(getNodeNameFromPath(filename, name), {
		model: {
			type: "Model",
			properties: {
				filename,
				repeat: false,
				repeatAxes: [{ axis: "x", count: 1, offset: 1 }],
			},
		},
	});
}

export function createImageNode(
	texturePath: string,
	materialName: string,
	name?: string,
): GameObject {
	return createNode(getNodeNameFromPath(texturePath, name), {
		geometry: {
			type: "Geometry",
			properties: { geometryType: "plane", args: [1, 1] },
		},
		material: {
			type: "Material",
			properties: { name: materialName } satisfies MaterialComponentProperties,
		},
	});
}

export function createPackedPrefabNode(url: string): GameObject {
	return createNode("Packed Prefab", {
		prefabref: {
			type: "PrefabRef",
			properties: { url },
		},
	});
}

/** Give a prefab's materials collision-safe names while keeping every reference in sync. */
export function scopePrefabMaterials(prefab: Prefab, scope: string): Prefab {
    const defined = new Set<string>();
    const collect = (node: GameObject) => {
        for (const component of Object.values(node.components ?? {})) {
            if (component?.type === 'Material' && component.properties.name && getMaterialDefinition(component.properties)) {
                defined.add(component.properties.name);
            }
        }
        node.children?.forEach(collect);
    };
    const collectDocument = (document: Prefab) => {
        collect(document.root);
        Object.values(document.prefabs ?? {}).forEach(collectDocument);
    };
    collectDocument(prefab);
    const remap = (node: GameObject): GameObject => ({ ...node,
        components: Object.fromEntries(Object.entries(node.components ?? {}).map(([key, component]) => {
            const id = component?.properties.name;
            return [key, component && (component.type === 'Material' || getComponent(component.type)?.slot === 'material') && defined.has(id) ? { ...component, properties: {
                ...component.properties, name: `${scope}:${id}`,
            } } : component];
        })), children: node.children?.map(remap),
    });
    const remapDocument = (document: Prefab): Prefab => ({ ...document, root: remap(document.root),
        ...(document.prefabs ? { prefabs: Object.fromEntries(Object.entries(document.prefabs)
            .map(([id, child]) => [id, remapDocument(child)])) } : {}),
    });
    return remapDocument(prefab);
}

export function normalizePrefab(prefab: Prefab): PrefabState {
	const nodesById: Record<string, PrefabNodeRecord> = {};
	const childIdsById: Record<string, string[]> = {};
	const parentIdById: Record<string, string | null> = {};

	insertSubtree(prefab.root, null, nodesById, childIdsById, parentIdById);

	const materials = collectMaterialDefinitions(nodesById);
	return {
		prefabId: prefab.id,
		prefabName: prefab.name,
        prefabs: collectPackedPrefabs({ nodesById, childIdsById }, prefab.prefabs),
		materials,
		rootId: prefab.root.id,
		nodesById,
		childIdsById,
		parentIdById,
	};
}

export function denormalizePrefab(
	state: Pick<
		PrefabState,
		"prefabId" | "prefabName" | "prefabs" | "rootId" | "nodesById" | "childIdsById"
	>,
): Prefab {

	return {
		id: state.prefabId,
		name: state.prefabName,

		root: embedPrefabDefinitions(denormalizeNode(state.rootId, state.nodesById, state.childIdsById), state.prefabs),
	};
}

/** Build the runtime pool from authored packed subtrees. Placement transforms stay on their owner. */
export function collectPackedPrefabs(
    state: Pick<PrefabState, 'nodesById' | 'childIdsById'>,
    inherited: Record<string, Prefab> = {},
    previous?: Record<string, Prefab>,
): Record<string, Prefab> | undefined {
    const result = { ...inherited };
    for (const node of Object.values(state.nodesById)) {
        if (!node.packed) continue;
        const root = denormalizeNode(node.id, state.nodesById, state.childIdsById);
        delete root.packed;
        delete root.hidden; delete root.disabled; delete root.locked;
        for (const [key, component] of Object.entries(root.components ?? {})) {
            if (component?.type === 'Transform') delete root.components![key];
        }
        const definition = { id: node.id, name: node.name, root };
        const old = previous?.[node.id];
        result[node.id] = old && samePrefabValue(old, definition) ? old : definition;
    }
    if (!Object.keys(result).length) return undefined;
    if (previous && Object.keys(result).length === Object.keys(previous).length
        && Object.entries(result).every(([id, value]) => previous[id] === value)) return previous;
    return result;
}

/** A portable subtree carries missing definitions on the first reference that uses them. */
export function embedPrefabDefinitions(root: GameObject, definitions: Record<string, Prefab> = {}): GameObject {
    const available = new Set<string>();
    const aliases = new Map<string, string>();
    const ids = new Set<string>();
    const scan = (node: GameObject) => { ids.add(node.id); if (node.packed) available.add(node.id); node.children?.forEach(scan); };
    scan(root);
    const visit = (node: GameObject) => {
        for (const [key, component] of Object.entries(node.components ?? {})) {
            const id = component?.type === 'PrefabRef' && component.properties.prefabId;
            if (!id || available.has(id)) continue;
            const definition = definitions[id];
            if (!definition) throw new Error(`Unknown inline prefab "${id}".`);
            available.add(id);
            const owner = remapPrefabNodeIds(definition.root, nodeId => {
                let nextId = nodeId === definition.root.id ? id : `${id}/${nodeId}`;
                while (ids.has(nextId)) nextId += '-copy';
                ids.add(nextId);
                return nextId;
            });
            if (owner.id !== id) aliases.set(id, owner.id);
            owner.packed = true;
            scan(owner);
            delete node.components![key];
            node.children = [owner, ...(node.children ?? [])];
        }
        node.children?.forEach(visit);
    };
    visit(root);
    const rewrite = (node: GameObject) => {
        for (const component of Object.values(node.components ?? {})) {
            const id = component?.type === 'PrefabRef' && component.properties.prefabId;
            if (id && aliases.has(id)) component!.properties.prefabId = aliases.get(id);
        }
        node.children?.forEach(rewrite);
    };
    rewrite(root);
    return root;
}

/** Rename a subtree and its internal prefab references together. */
export function remapPrefabNodeIds(root: GameObject, rename: (id: string) => string): GameObject {
    const ids = new Map<string, string>();
    const copy = (node: GameObject): GameObject => {
        const { children, ...record } = node;
        const id = rename(node.id);
        ids.set(node.id, id);
        return { ...structuredClone(record), id, children: children?.map(copy) };
    };
    const result = copy(root);
    const rewrite = (node: GameObject) => {
        for (const component of Object.values(node.components ?? {})) {
            const id = component?.type === 'PrefabRef' && component.properties.prefabId;
            if (id && ids.has(id)) component!.properties.prefabId = ids.get(id);
        }
        node.children?.forEach(rewrite);
    };
    rewrite(result);
    return result;
}

/** Duplicate a packed owner as a lightweight reference. */
export function packedReference(node: PrefabNodeRecord, prefabId = node.id): PrefabNodeRecord {
    const components: NonNullable<GameObject['components']> = {};
    for (const [key, component] of Object.entries(node.components ?? {})) {
        if (component?.type === 'Transform') components[key] = structuredClone(component);
    }
    let key = 'prefabref';
    while (components[key]) key += '_';
    components[key] = { type: 'PrefabRef', properties: { prefabId } };
    const copy = { ...node, components };
    delete copy.packed;
    return copy;
}

export function collectSubtreeIds(
	id: string,
	childIdsById: Record<string, string[]>,
) {
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
	if (nodesById[node.id]) {
		throw new Error(`Duplicate prefab node id: ${node.id}`);
	}
	const { children, ...nodeRecord } = node;
	nodesById[node.id] = nodeRecord;
	childIdsById[node.id] = children?.map((child) => child.id) ?? [];
	parentIdById[node.id] = parentId;

	children?.forEach((child) => {
		insertSubtree(child, node.id, nodesById, childIdsById, parentIdById);
	});
}

/** Same-scene copies share named materials instead of defining them again. */
export function cloneComponentsForDuplicate(components: PrefabNodeRecord['components']) {
    const copy = structuredClone(components);
    for (const component of Object.values(copy ?? {})) {
        if (component?.type !== 'Material' || !component.properties.name) continue;
        for (const field of MATERIAL_FIELDS) delete component.properties[field];
    }
    return copy;
}

export function cloneSubtree(
	id: string,
	parentId: string | null,
	source: Pick<PrefabState, "nodesById" | "childIdsById">,
	nodesById: Record<string, PrefabNodeRecord>,
	childIdsById: Record<string, string[]>,
	parentIdById: Record<string, string | null>,
): string | null {
	const originalNode = source.nodesById[id];
	if (!originalNode) return null;

	const clonedId = crypto.randomUUID();
	const clonedNode: PrefabNodeRecord = {
		...(originalNode.packed ? packedReference(originalNode) : { ...originalNode, components: cloneComponentsForDuplicate(originalNode.components) }),
		id: clonedId,
		name: `${originalNode.name ?? originalNode.id} Copy`,
	};

	nodesById[clonedId] = clonedNode;
	parentIdById[clonedId] = parentId;

	const clonedChildIds = (originalNode.packed ? [] : source.childIdsById[id] ?? [])
		.map((childId) =>
			cloneSubtree(
				childId,
				clonedId,
				source,
				nodesById,
				childIdsById,
				parentIdById,
			),
		)
		.filter((childId): childId is string => Boolean(childId));

	childIdsById[clonedId] = clonedChildIds;
	return clonedId;
}

export function isDescendant(
	id: string,
	potentialAncestorId: string,
	parentIdById: Record<string, string | null>,
) {
	let currentId: string | null | undefined = id;

	while (currentId) {
		if (currentId === potentialAncestorId) return true;
		currentId = parentIdById[currentId];
	}

	return false;
}
