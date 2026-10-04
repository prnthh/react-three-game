import type { PrefabState } from '../../core/prefab.js';
import { findComponent } from '../../core/types.js';

export type SceneAuthoringAdvice = { code: string; message: string; count: number; nodeIds: string[] };

/** Document heuristics only: no renderer traversal, asset loads or estimated FPS. */
export function analyzeSceneAuthoring(state: PrefabState) {
    const active = Object.values(state.nodesById).filter(node => {
        for (let id: string | null = node.id; id; id = state.parentIdById[id]) {
            if (state.nodesById[id].disabled || state.nodesById[id].hidden) return false;
        }
        return true;
    });
    const boxes: string[] = [], optedOut: string[] = [], pointShadows: string[] = [];
    const boxShapes = new Set<string>(), models = new Set<string>();
    let meshCount = 0, modelCount = 0;
    for (const node of active) {
        const mesh = (findComponent(node, 'Geometry') ?? findComponent(node, 'BufferGeometry'))?.properties;
        const geometry = findComponent(node, 'Geometry')?.properties;
        const model = findComponent(node, 'Model')?.properties;
        const light = findComponent(node, 'PointLight')?.properties;
        if (mesh && mesh.visible !== false) {
            meshCount++;
            if (mesh.instanced === false) optedOut.push(node.id);
            if (geometry && (geometry.geometryType ?? 'box') === 'box') {
                boxes.push(node.id);
                boxShapes.add(JSON.stringify([0, 1, 2].map(i => geometry.args?.[i] ?? 1)));
            }
        }
        if (model?.filename) { modelCount++; models.add(model.filename); }
        if (light?.castShadow && light.shadowAutoUpdate !== false) pointShadows.push(node.id);
    }
    const advisories: SceneAuthoringAdvice[] = [];
    const advise = (code: string, message: string, nodeIds: string[]) => {
        advisories.push({ code, message, count: nodeIds.length, nodeIds: nodeIds.slice(0, 8) });
    };
    if (optedOut.length >= 8) {
        advise('instancing-disabled', 'Many Mesh nodes explicitly disable instancing. Keep its default enabled for compatible repeated geometry/materials; disable only when the rendering or interaction needs it.', optedOut);
    }
    if (pointShadows.length >= 2) {
        advise('live-point-shadows', 'Multiple PointLights request continuously updated shadows (six faces per light). For static content consider shadowAutoUpdate:false with explicit invalidation after changes. Keep live shadows for moving casters/lights. Host code may override these authored settings.', pointShadows);
    }
    const rootChildren = state.childIdsById[state.rootId];
    if (rootChildren.length > 50) {
        advise('flat-hierarchy', 'Group related pieces under named assembly/region parents with stable IDs and local transforms. Groups improve authoring; grouping alone does not reduce draw calls.', rootChildren);
    }
    return {
        scope: 'authored document; not measured rendering performance',
        stats: { activeNodes: active.length, meshNodes: meshCount, boxNodes: boxes.length, distinctBoxSizes: boxShapes.size,
            instancingDisabled: optedOut.length, modelNodes: modelCount, distinctModelUrls: models.size,
            materialDefinitions: Object.keys(state.materials).length, livePointShadows: pointShadows.length },
        advisories,
    };
}
