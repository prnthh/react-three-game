import { cachedMaterialDefinition, compactPrefabMaterial, type PrefabNodeRecord } from '../../core/prefab.js';
import type { PrefabDocumentApi } from '../../core/prefabDocumentApi.js';
import type { PrefabMaterial } from '../../core/types.js';

interface SceneMaterialEntry {
    /** Picker identity; unnamed entries become persistent named definitions when shared. */
    id: string;
    label: string;
    nodeId: string;
    componentKey: string;
    material: PrefabMaterial;
    named: boolean;
}

/** Unique authored materials, including inline definitions that have no reference ID yet.
 * Explicit IDs remain distinct assets even when their current settings happen to match.
 */
export function collectSceneMaterials(nodes: Record<string, PrefabNodeRecord>): SceneMaterialEntry[] {
    const entries: SceneMaterialEntry[] = [];
    const ids = new Set<string>();
    const signatures = new Set<string>();
    const candidates = Object.values(nodes).flatMap(node => Object.entries(node.components ?? {})
        .filter(([, component]) => component?.type === 'Material')
        .map(([key, component]) => ({ node, key, component: component!, properties: component!.properties })));
    const reservedIds = new Set(candidates.map(entry => entry.properties.name).filter(Boolean));
    // Prefer explicit definitions when an identical inline material also exists.
    candidates.sort((a, b) => Number(!!b.properties.name) - Number(!!a.properties.name));
    for (const { node, key, component, properties } of candidates) {
        const definition = cachedMaterialDefinition(component);
        if (properties.name && !definition) continue; // Reference, not another material.
        const material = definition ?? {};
        const signature = JSON.stringify(compactPrefabMaterial(material));
        const named = !!properties.name;
        if (named ? ids.has(properties.name) : signatures.has(signature)) continue;
        let id = properties.name || `inline:${encodeURIComponent(node.id)}:${encodeURIComponent(key)}`;
        while (!named && (ids.has(id) || reservedIds.has(id))) id += '_';
        ids.add(id); signatures.add(signature);
        const generatedId = typeof properties.name === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(properties.name);
        entries.push({ id, label: named && !generatedId ? properties.name : node.name || node.id,
            nodeId: node.id, componentKey: key, material, named });
    }
    return entries;
}

/** Give an inline material a persisted reference ID without copying its settings to consumers. */
export function ensureMaterialReference(document: Pick<PrefabDocumentApi, 'get' | 'update'>, nodeId: string, componentKey: string): string {
    const component = document.get(nodeId)?.components?.[componentKey];
    if (component?.type !== 'Material') throw new Error('The source material no longer exists.');
    if (component.properties.name) return component.properties.name;
    const id = crypto.randomUUID();
    document.update(nodeId, node => ({ ...node, components: { ...node.components,
        [componentKey]: { ...component, properties: { ...component.properties, materialType: component.properties.materialType ?? 'standard', name: id } },
    } }));
    return id;
}
