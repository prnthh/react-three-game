import {
	getComponentAssetRefs,
	getComponentDefaultProperties,
	getComponentDef,
} from "./components/ComponentRegistry";
import type { ComponentData, GameObject, MaterialComponentProperties, Prefab, PrefabMaterial } from "./types";

export type PrefabNodeRecord = Omit<GameObject, "children">;
export type PrefabAssetRefCounts = Record<string, number>;

export interface PrefabState {
	prefabId?: string;
	prefabName?: string;
	materials: Record<string, PrefabMaterial>;
	rootId: string;
	nodesById: Record<string, PrefabNodeRecord>;
	childIdsById: Record<string, string[]>;
	parentIdById: Record<string, string | null>;
	assetRefCounts: PrefabAssetRefCounts;
}

export const DEFAULT_MATERIAL_ID = "default";

export function createDefaultMaterial(): PrefabMaterial {
	return {
		name: "Default",
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
		compact[key] = clonePrefabValue(value);
	});

	return compact as PrefabMaterial;
}

function compactMaterials(materials: Record<string, PrefabMaterial>) {
	const compact: Record<string, PrefabMaterial> = {};

	Object.entries(materials).forEach(([id, material]) => {
		const definition = compactPrefabMaterial(material);
		const isImplicitDefault = Object.keys(definition).length === 0
			|| (Object.keys(definition).length === 1 && definition.name === "Default");
		if (id === DEFAULT_MATERIAL_ID && isImplicitDefault) return;
		compact[id] = definition;
	});

	return compact;
}

function normalizeMaterials(materials?: Record<string, PrefabMaterial>) {
	return {
		[DEFAULT_MATERIAL_ID]: createDefaultMaterial(),
		...clonePrefabValue(materials ?? {}),
	};
}

function clonePrefabValue<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => clonePrefabValue(item)) as T;
	}

	if (value && typeof value === "object") {
		const clone: Record<string, unknown> = {};

		Object.entries(value).forEach(([key, entry]) => {
			clone[key] = clonePrefabValue(entry);
		});

		return clone as T;
	}

	return value;
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

function sameStringArrays(left: string[], right: string[]) {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

function getAssetRefs(node?: Pick<GameObject, "components"> | null) {
	const refs: string[] = [];

	Object.values(node?.components ?? {}).forEach((component) => {
		if (!component?.type) return;

		for (const ref of getComponentAssetRefs(
			component.type,
			component.properties ?? {},
		)) {
			refs.push(`${ref.type}:${ref.path}`);
		}
	});

	return refs.sort();
}

function addAssetRefs(assetRefCounts: PrefabAssetRefCounts, refs: string[]) {
	refs.forEach((ref) => {
		assetRefCounts[ref] = (assetRefCounts[ref] ?? 0) + 1;
	});
}

function removeAssetRefs(assetRefCounts: PrefabAssetRefCounts, refs: string[]) {
	refs.forEach((ref) => {
		const nextCount = (assetRefCounts[ref] ?? 0) - 1;
		if (nextCount > 0) {
			assetRefCounts[ref] = nextCount;
			return;
		}

		delete assetRefCounts[ref];
	});
}

function getMaterialAssetRefs(material: PrefabMaterial) {
	return [material.texture, material.normalMapTexture]
		.filter((path): path is string => typeof path === "string" && path.length > 0)
		.map((path) => `texture:${path}`);
}

function createAssetRefCounts(
	nodesById: Record<string, PrefabNodeRecord>,
	materials: Record<string, PrefabMaterial>,
) {
	const assetRefCounts: PrefabAssetRefCounts = {};
	Object.values(nodesById).forEach((node) => {
		addAssetRefs(assetRefCounts, getAssetRefs(node));
	});
	Object.values(materials).forEach((material) => {
		addAssetRefs(assetRefCounts, getMaterialAssetRefs(material));
	});
	return assetRefCounts;
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
		const defaults = getComponentDefaultProperties(getComponentDef(component.type), component.properties);
		const properties = Object.entries(component.properties ?? {}).reduce<Record<string, unknown>>((sparse, [name, value]) => {
			if (!samePrefabValue(value, defaults[name])) sparse[name] = clonePrefabValue(value);
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
		properties: clonePrefabValue(properties ?? {}),
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
	materialId: string,
	name?: string,
): GameObject {
	return createNode(getNodeNameFromPath(texturePath, name), {
		mesh: {
			type: "Mesh",
			properties: {},
		},
		geometry: {
			type: "Geometry",
			properties: { geometryType: "plane", args: [1, 1] },
		},
		material: {
			type: "Material",
			properties: { materialId } satisfies MaterialComponentProperties,
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

/** Give a prefab's materials collision-safe ids while keeping every reference in sync. */
export function scopePrefabMaterials(prefab: Prefab, scope: string): Prefab {
	const ids: Record<string, string> = {};
	const materials: Record<string, PrefabMaterial> = {};
	Object.entries(prefab.materials ?? {}).forEach(([id, material]) => {
		ids[id] = `${scope}:${id}`;
		materials[ids[id]] = material;
	});

	const remap = (node: GameObject): GameObject => {
		const components = { ...node.components };
		Object.entries(components).forEach(([key, component]) => {
			if (component?.type === "Material") {
				const materialId = component.properties.materialId ?? DEFAULT_MATERIAL_ID;
				components[key] = {
					...component,
					properties: {
						...component.properties,
						materialId: ids[materialId] ?? materialId,
					},
				};
			}
		});

		return {
			...node,
			components,
			children: node.children?.map(remap),
		};
	};

	return {
		...prefab,
		materials,
		root: remap(prefab.root),
	};
}

export function normalizePrefab(prefab: Prefab): PrefabState {
	const nodesById: Record<string, PrefabNodeRecord> = {};
	const childIdsById: Record<string, string[]> = {};
	const parentIdById: Record<string, string | null> = {};

	insertSubtree(prefab.root, null, nodesById, childIdsById, parentIdById);

	const materials = normalizeMaterials(prefab.materials);
	const assetRefCounts = createAssetRefCounts(nodesById, materials);

	return {
		prefabId: prefab.id,
		prefabName: prefab.name,
		materials,
		rootId: prefab.root.id,
		nodesById,
		childIdsById,
		parentIdById,
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
		...(assetRefsChanged ? { assetRefCounts: nextAssetRefCounts } : null),
	};
}

export function denormalizePrefab(
	state: Pick<
		PrefabState,
		"prefabId" | "prefabName" | "materials" | "rootId" | "nodesById" | "childIdsById"
	>,
): Prefab {
	const materials = compactMaterials(state.materials);

	return {
		id: state.prefabId,
		name: state.prefabName,
		...(Object.keys(materials).length > 0 ? { materials } : null),
		root: denormalizeNode(state.rootId, state.nodesById, state.childIdsById),
	};
}

export function updateMaterialAssetRefs(
	assetRefCounts: PrefabAssetRefCounts,
	current: PrefabMaterial | undefined,
	next: PrefabMaterial,
) {
	const nextAssetRefCounts = { ...assetRefCounts };
	if (current) removeAssetRefs(nextAssetRefCounts, getMaterialAssetRefs(current));
	addAssetRefs(nextAssetRefCounts, getMaterialAssetRefs(next));
	return nextAssetRefCounts;
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
		components: clonePrefabValue(originalNode.components),
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
	node.children?.forEach((child) => {
		refs.push(...collectSubtreeAssetRefs(child));
	});
	return refs;
}

export function collectAssetRefsForIds(
	ids: string[],
	nodesById: Record<string, PrefabNodeRecord>,
) {
	return ids.reduce<string[]>((refs, id) => {
		refs.push(...getAssetRefs(nodesById[id]));
		return refs;
	}, []);
}
