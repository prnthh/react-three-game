import { attachPointerTool } from '../tools/pointerTool.js';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Raycaster, Vector2, Vector3 } from 'three';
import { useEditorToolSession, type EditorToolDefinition, type EditorToolViewportProps, type EditorToolPanelProps } from '../tools/EditorTools.js';
import { useSceneComponents } from '../../runtime/scene/SceneContext.js';
import { findTerrainSurface, getTerrainFailure, TERRAIN_SURFACE_COMPONENT, type TerrainSurface } from '../../runtime/terrain/terrainSurface.js';
import { paintWeights, terrainLayers, type TerrainProperties } from '../../runtime/terrain/terrainData.js';
import { useEditorContext, useEditorRef } from '../EditorContext.js';
import { usePrefabStore } from '../../runtime/prefabs/PrefabStoreContext.js';
import { base, colors } from '../ui/styles.js';

export const TERRAIN_PAINT_TOOL = 'terrain.paint-materials';
type TerrainBrushSettings = { layer: number; radius: number; strength: number; hardness: number; pressure: boolean };

type Target = { id: string; componentKey: string; surface: TerrainSurface; bounds: Box3; width: number; depth: number };
type Painted = Target & { before: ImageData; image: ImageData; changed: boolean };

/** One world-space stroke may affect several independently authored terrain maps. */
export function TerrainPaintTool({ camera, controlsRef }: EditorToolViewportProps) {
    const edit = useEditorToolSession<TerrainBrushSettings>(TERRAIN_PAINT_TOOL);
    const editor = useEditorRef();
    const surfaces = useSceneComponents(TERRAIN_SURFACE_COMPONENT);
    const gl = useThree(state => state.gl), invalidate = useThree(state => state.invalidate);
    const latest = useRef({ edit, editor, surfaces });
    latest.current = { edit, editor, surfaces };
    const validateRef = useRef<(() => void) | null>(null);
    useFrame(() => validateRef.current?.());
    useEffect(() => {
        const canvas = gl.domElement;
        const ray = new Raycaster(), ndc = new Vector2(), scale = new Vector3(), local = new Vector3();
        const hovered = new Set<TerrainSurface>();
        let stroke: { tiles: Map<string, Painted>; previous: Vector3 | null; remaining: number } | null = null;
        function targets(): Target[] {
            const api = latest.current.editor;
            const source = Object.values(api.get(edit.nodeId)?.components ?? {}).find(c => c?.type === 'Terrain');
            const signature = JSON.stringify(terrainLayers((source?.properties as TerrainProperties)?.layers));
            return latest.current.surfaces.flatMap(({ key: id, value: surface }) => {
                const node = api.get(id);
                if (!node || node.locked || surface.ready === false || !surface.mesh || findTerrainSurface(api.getObject(id)) !== surface) return [];
                for (let object = surface.mesh; object; object = object.parent as typeof object) if (!object.visible) return [];
                const entry = Object.entries(node.components ?? {}).find(([, c]) => c?.type === 'Terrain');
                if (!entry || JSON.stringify(terrainLayers((entry[1]!.properties as TerrainProperties).layers)) !== signature) return [];
                surface.mesh.updateWorldMatrix(true, false);
                surface.mesh.getWorldScale(scale);
                if (Math.abs(scale.x) < 1e-8 || Math.abs(scale.z) < 1e-8) return [];
                if (!surface.mesh.geometry.boundingBox) surface.mesh.geometry.computeBoundingBox();
                return [{ id, componentKey: entry[0], surface,
                    bounds: surface.mesh.geometry.boundingBox!.clone().applyMatrix4(surface.mesh.matrixWorld),
                    width: surface.width * Math.abs(scale.x), depth: surface.depth * Math.abs(scale.z) }];
            });
        }
        function hit(event: PointerEvent, candidates: Target[]) {
            const rect = canvas.getBoundingClientRect();
            ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
            camera.updateMatrixWorld();
            ray.setFromCamera(ndc, camera);
            return ray.intersectObjects(candidates.filter(t => ray.ray.intersectsBox(t.bounds)).map(t => t.surface.mesh), false)[0]?.point ?? null;
        }
        const hide = () => { for (const surface of hovered) surface.brushVisible.value = 0; hovered.clear(); invalidate(); };
        function project(target: Target, point: Vector3) {
            local.copy(point); target.surface.mesh.worldToLocal(local);
            return new Vector2(local.x / target.surface.width + 0.5, 0.5 - local.z / target.surface.depth);
        }
        function show(candidates: Target[], point: Vector3) {
            hide();
            const radius = latest.current.edit.settings.radius;
            for (const target of candidates) {
                if (target.bounds.distanceToPoint(point) > radius) continue;
                const surface = target.surface;
                surface.brushCenter.value.copy(project(target, point));
                surface.brushRadius.value.set(radius / target.width, radius / target.depth);
                surface.brushVisible.value = 1;
                hovered.add(surface);
            }
            invalidate();
        }
        function valid(tile: Painted) {
            const node = latest.current.editor.get(tile.id);
            return node && !node.locked && node.components?.[tile.componentKey]?.type === 'Terrain'
                && findTerrainSurface(latest.current.editor.getObject(tile.id)) === tile.surface;
        }
        function finish(commit: boolean) {
            if (!stroke) return;
            const tiles = [...stroke.tiles.values()];
            stroke = null;
            const restore = () => { for (const tile of tiles) {
                tile.surface.canvas.getContext('2d')!.putImageData(tile.before, 0, 0);
                tile.surface.texture.needsUpdate = true;
            } };
            try {
                if (!commit || !tiles.every(valid)) { restore(); return; }
                // Encode everything before changing the document. Batch rolls back on failure
                // and publishes once, so all affected tiles share a single undo entry.
                const updates = tiles.filter(tile => tile.changed).map(tile => ({ tile, weightMap: tile.surface.canvas.toDataURL('image/png') }));
                if (updates.length) latest.current.editor.batch(() => {
                    for (const { tile, weightMap } of updates) latest.current.editor.update(tile.id, node => {
                        const component = node.components?.[tile.componentKey];
                        if (!component || component.type !== 'Terrain') throw new Error('Terrain changed during painting');
                        return { ...node, components: { ...node.components,
                            [tile.componentKey]: { ...component, properties: { ...component.properties, weightMap } } } };
                    });
                });
            } catch (error) {
                restore();
                latest.current.edit.setError(error instanceof Error ? error.message : String(error));
            } finally { invalidate(); }
        }
        function paint(event: PointerEvent) {
            if (!stroke) return;
            const candidates = targets(), point = hit(event, candidates);
            if (!point) { stroke.previous = null; stroke.remaining = 0; hide(); return; }
            show(candidates, point);
            const brush = latest.current.edit.settings;
            const pressure = brush.pressure && event.pointerType === 'pen' ? Math.max(0, Math.min(1, event.pressure)) : 1;
            const dirty = new Set<Painted>();
            const stamp = (center: Vector3) => {
                if (pressure <= 0) return;
                for (const target of candidates) {
                    if (target.bounds.distanceToPoint(center) > brush.radius) continue;
                    let tile = stroke!.tiles.get(target.id);
                    if (!tile) {
                        const context = target.surface.canvas.getContext('2d')!;
                        const { width, height } = target.surface.canvas;
                        tile = { ...target, before: context.getImageData(0, 0, width, height), image: context.getImageData(0, 0, width, height), changed: false };
                        stroke!.tiles.set(target.id, tile);
                    }
                    const uv = project(target, center);
                    if (paintWeights(tile.image, { ...brush, width: target.width, depth: target.depth, u: uv.x, v: uv.y, strength: brush.strength * pressure })) {
                        tile.changed = true; dirty.add(tile);
                    }
                }
            };
            const texel = Math.min(...candidates.map(target => Math.min(target.width, target.depth) / Math.max(1, target.surface.canvas.width - 1)));
            const spacing = Math.max(brush.radius * 0.15, texel * 0.5);
            if (!stroke.previous) { stamp(point); stroke.remaining = spacing; }
            else {
                const length = point.distanceTo(stroke.previous);
                let traveled = stroke.remaining;
                const center = new Vector3();
                while (traveled <= length) { stamp(center.copy(stroke.previous).lerp(point, traveled / length)); traveled += spacing; }
                stroke.remaining = traveled - length;
            }
            stroke.previous = point.clone();
            // Upload each changed tile once per event, not once per stamp.
            for (const tile of dirty) {
                tile.surface.canvas.getContext('2d')!.putImageData(tile.image, 0, 0);
                tile.surface.texture.needsUpdate = true;
            }
            invalidate();
        }
        const interaction = attachPointerTool(canvas, {
            begin(event) {
                const candidates = targets();
                if (!candidates.length) {
                    latest.current.edit.setError(getTerrainFailure(latest.current.editor.getObject(edit.nodeId)) ?? 'No editable terrain is ready. Check image URLs and cross-origin access.');
                    return false;
                }
                if (!hit(event, candidates)) return false;
                stroke = { tiles: new Map(), previous: null, remaining: 0 };
                latest.current.edit.setError(null);
                return true;
            },
            move: paint, end: finish,
            hover(event) { const candidates = targets(), point = hit(event, candidates); if (point) show(candidates, point); else hide(); },
            leave: hide,
            onError: error => latest.current.edit.setError(error instanceof Error ? error.message : String(error)),
        }, { controls: () => controlsRef.current });
        validateRef.current = () => { if (stroke && [...stroke.tiles.values()].some(tile => !valid(tile))) interaction.cancel(); };
        const unregister = latest.current.edit.registerCancellation(interaction.cancel);
        return () => { unregister(); interaction.dispose(); hide(); validateRef.current = null; };
    }, [edit.nodeId, camera, controlsRef, gl, invalidate]);
    return null;
}

export function TerrainPaintPanel({ canUndo, canRedo }: EditorToolPanelProps) {
    const edit = useEditorToolSession<TerrainBrushSettings>(TERRAIN_PAINT_TOOL);
    const editor = useEditorRef();
    const { onFocusNode } = useEditorContext();
    const node = usePrefabStore(state => edit.nodeId ? state.nodesById[edit.nodeId] : null);
    const component = Object.values(node?.components ?? {}).find(component => component?.type === 'Terrain');
    const layers = terrainLayers((component?.properties as TerrainProperties)?.layers);
    return <div role="region" aria-label="Terrain painting" style={{ ...base.panel, position: 'absolute', top: 56, left: 12, zIndex: 25, width: 'min(290px, calc(100% - 24px))', maxHeight: 'calc(100% - 68px)', overflow: 'auto', padding: 14, boxSizing: 'border-box' }}>
        <strong>Paint terrain · {node?.name}</strong>
        <p style={{ color: colors.textMuted }}>Pencil or left-drag to paint. Fingers or right-drag to navigate. Paint across unlocked terrain tiles with matching material layers. Other objects are isolated.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {layers.map((layer, index) => <button key={index} type="button" aria-pressed={edit.settings.layer === index}
                style={{ ...base.btn, minHeight: 48, borderColor: edit.settings.layer === index ? colors.accent : colors.border }}
                onClick={() => edit.setSettings({ ...edit.settings, layer: index })}>
                <span style={{ display: 'inline-block', width: 12, height: 12, background: layer.color, borderRadius: 3, marginRight: 8 }} />{layer.name}
            </button>)}
        </div>
        {([{ key: 'radius', label: 'Radius (world units)', min: 0.1, max: 20, step: 0.1 },
            { key: 'strength', label: 'Strength', min: 0.01, max: 1, step: 0.01 },
            { key: 'hardness', label: 'Hardness', min: 0, max: 0.99, step: 0.01 }] as const).map(field =>
            <label key={field.key} style={{ display: 'grid', gap: 6, margin: '14px 0' }}>
                {field.label}: {edit.settings[field.key].toFixed(2)}
                <input aria-label={field.label} type="range" min={field.min} max={field.max} step={field.step} value={edit.settings[field.key]}
                    style={{ width: '100%', minHeight: 32 }} onChange={e => edit.setSettings({ ...edit.settings, [field.key]: Number(e.target.value) })} />
            </label>)}
        <label style={{ display: 'flex', gap: 8, minHeight: 44, alignItems: 'center' }}><input type="checkbox" checked={edit.settings.pressure}
            onChange={e => edit.setSettings({ ...edit.settings, pressure: e.target.checked })} />Pencil pressure controls strength</label>
        <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={{ ...base.btn, minHeight: 44 }} disabled={!canUndo} onClick={editor.undo}>Undo</button>
            <button type="button" style={{ ...base.btn, minHeight: 44 }} disabled={!canRedo} onClick={editor.redo}>Redo</button>
            <button type="button" style={{ ...base.btn, minHeight: 44 }} onClick={() => edit.nodeId && onFocusNode?.(edit.nodeId)}>Focus</button>
        </div>
        <p style={{ color: colors.textMuted }}>One stroke updates every touched tile as one undo step. Escape cancels an active stroke. Save the scene to keep your work.</p>
        {edit.error && <p role="alert" style={{ color: colors.danger }}>{edit.error}</p>}
        <button type="button" style={{ ...base.btn, minHeight: 44, width: '100%' }} onClick={edit.end}>Done painting</button>
    </div>;
}

export const terrainPaintTool: EditorToolDefinition<TerrainBrushSettings> = {
    id: TERRAIN_PAINT_TOOL,
    label: 'Paint terrain materials',
    supports: node => Object.values(node.components ?? {}).some(component => component?.type === 'Terrain'),
    createSettings: () => ({ layer: 0, radius: 2, strength: 0.25, hardness: 0.4, pressure: true }),
    Viewport: TerrainPaintTool,
    Panel: TerrainPaintPanel,
};
