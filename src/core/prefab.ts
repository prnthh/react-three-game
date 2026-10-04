import {
	getComponentDefaultProperties,
	getComponent,
} from "./ComponentRegistry.js";
import type { ComponentData, GameObject, MaterialComponentProperties, Prefab, PrefabMaterial } from "./types.js";

export type PrefabNodeRecord = Omit<GameObject, "children">;

export interface PrefabState {
	prefabId?: string;
	prefabName?: string;
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

function samePrefabValue(left: unknown, right: unknown): boolean {
	if (Array.isArray(left) && Array.isArray(right)) {
		return left.length === right.length
			&& left.every((value, index) => samePrefabValue(value, right[index]));
	}

	if (left && right && typeof left === "object" && typeof right === "object") {
		const leftEntries = Object.entries(left);
		const rightRecord = right as Record<string, unknown>;
		return leftEntries.length === Object.keys(rightRecord).length
			&& leftEntries.every(([key, value]) => samePrefabValue(value, rightRecord[key]));
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
    const entries = MATERIAL_FIELDS.flatMap(key => {
        const value = properties[key];
        return value === undefined || value === null || value === '' ? [] : [[key, value]];
    });
    return entries.length ? Object.fromEntries(entries) : null;
}

/** A derived authoring index, never serialized as a separate material table. */
const materialDefinitionCache = new WeakMap<ComponentData, PrefabMaterial | null>();

export function collectMaterialDefinitions(nodes: Record<string, PrefabNodeRecord>): Record<string, PrefabMaterial> {
    const materials: Record<string, PrefabMaterial> = {};
    for (const node of Object.values(nodes)) for (const component of Object.values(node.components ?? {})) {
        if (component?.type !== 'Material') continue;
        const { name: materialName } = component.properties;
        if (!materialDefinitionCache.has(component)) {
            materialDefinitionCache.set(component, getMaterialDefinition(component.properties));
        }
        const definition = materialDefinitionCache.get(component);
        if (materialName && definition && !Object.hasOwn(materials, materialName)) materials[materialName] = definition;
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

function denormalizeNode(
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
		properties: structuredClone(type === 'Material' && !properties?.name
            ? { materialType: 'standard', ...properties, name: crypto.randomUUID() }
            : properties ?? {}),
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
    collect(prefab.root);
    const remap = (node: GameObject): GameObject => ({ ...node,
        components: Object.fromEntries(Object.entries(node.components ?? {}).map(([key, component]) => {
            const id = component?.properties.name;
            return [key, component && (component.type === 'Material' || getComponent(component.type)?.slot === 'material') && defined.has(id) ? { ...component, properties: {
                ...component.properties, name: `${scope}:${id}`,
            } } : component];
        })), children: node.children?.map(remap),
    });
    return { ...prefab, root: remap(prefab.root) };
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
		"prefabId" | "prefabName" | "rootId" | "nodesById" | "childIdsById"
	>,
): Prefab {

	return {
		id: state.prefabId,
		name: state.prefabName,
		root: denormalizeNode(state.rootId, state.nodesById, state.childIdsById),
	};
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
		...originalNode,
		components: cloneComponentsForDuplicate(originalNode.components),
		id: clonedId,
		name: `${originalNode.name ?? originalNode.id} Copy`,
	};

	nodesById[clonedId] = clonedNode;
	parentIdById[clonedId] = parentId;

	const clonedChildIds = (source.childIdsById[id] ?? [])
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


/** Preserve selector identities when a new prefab version changes only part of the document. */
export function reconcilePrefabState(previous: PrefabState, next: PrefabState): PrefabState {
    const share = <T,>(before: Record<string, T>, after: Record<string, T>): Record<string, T> => {
        let unchanged = Object.keys(before).length === Object.keys(after).length;
        const result: Record<string, T> = {};
        for (const [id, value] of Object.entries(after)) {
            const same = Object.hasOwn(before, id)
                && (before[id] === value || JSON.stringify(before[id]) === JSON.stringify(value));
            result[id] = same ? before[id] : value;
            unchanged = unchanged && same;
        }
        return unchanged ? before : result;
    };
    return {
        ...next,
        nodesById: share(previous.nodesById, next.nodesById),
        childIdsById: share(previous.childIdsById, next.childIdsById),
        parentIdById: share(previous.parentIdById, next.parentIdById),
        materials: share(previous.materials, next.materials),
    };
}
