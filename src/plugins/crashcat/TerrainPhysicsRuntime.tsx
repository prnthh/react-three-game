import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MotionType, rigidBody, type Shape } from 'crashcat';
import { Box3, Vector3, type Scene } from 'three';
import { useSceneComponents } from '../../runtime/scene/SceneContext.js';
import { TERRAIN_SURFACE_COMPONENT, TERRAIN_FAILURE_COMPONENT } from '../../runtime/terrain/terrainSurface.js';
import { TERRAIN_PHYSICS_COMPONENT } from './TerrainPhysicsComponent.js';
import { useCrashcat } from './CrashcatRuntime.js';
import { createColliderResidencyScheduler } from './colliderResidency.js';

const states = new WeakMap<Scene, { ready: boolean; active: number; prepared: number; maxActivationMs: number; lastBuildMs: number; maxUpdateMs: number; maxSubmitMs: number; activations: number }>();
export function getTerrainPhysicsStatus(scene: Scene) { return states.get(scene) ?? null; }

/** Optional terrain adapter. The host chooses the camera-nearest active collider budget. */
export function TerrainPhysicsRuntime({ activeLimit }: { activeLimit: number }) {
    if (!Number.isInteger(activeLimit) || activeLimit < 1) throw new Error('Terrain activeLimit must be a positive integer');
    const scene = useThree(s => s.scene);
    const api = useCrashcat();
    const components = useSceneComponents(TERRAIN_PHYSICS_COMPONENT);
    const hasTargets = components.length > 0;
    const latest = useRef(components); latest.current = components;
    const tick = useRef<((camera: Vector3) => void) | null>(null);
    const position = useRef(new Vector3());
    useEffect(() => {
        if (!api || !hasTargets) return;
        const status = { ready: false, active: 0, prepared: 0, maxActivationMs: 0, lastBuildMs: 0, maxUpdateMs: 0, maxSubmitMs: 0, activations: 0 };
        states.set(scene, status);
        let worker: Worker;
        try { worker = new Worker(new URL('./terrainCollider.worker.js', import.meta.url), { type: 'module' }); }
        catch (error) {
            for (const { value } of latest.current) { value.state = 'error'; value.error = `Terrain collider worker unavailable: ${error}`; }
            return () => { states.delete(scene); };
        }
        let pending: { resolve: (shape: Shape) => void; reject: (error: Error) => void } | null = null;
        let requestId = 0;
        let workerFailure: Error | null = null;
        const inputs = new Map<string, () => { positions: number[]; indices: number[] }>();
        const getHandle = (id: string) => latest.current.find(entry => entry.key === id)?.value;
        worker.onmessage = event => {
            const { shape, error, buildMs } = event.data;
            status.lastBuildMs = buildMs ?? 0;
            const task = pending; pending = null;
            if (error) task?.reject(new Error(error)); else task?.resolve(shape);
        };
        worker.onerror = event => {
            workerFailure = new Error(event.message || 'Terrain collider worker failed');
            pending?.reject(workerFailure); pending = null;
        };
        const scheduler = createColliderResidencyScheduler<Shape>({
            activeLimit,
            build: target => {
                if (workerFailure) return Promise.reject(workerFailure);
                const start = performance.now();
                const data = inputs.get(target.id)!();
                return new Promise((resolve, reject) => {
                    pending = { resolve, reject };
                    worker.postMessage({ id: ++requestId, ...data });
                    status.maxSubmitMs = Math.max(status.maxSubmitMs, performance.now() - start);
                });
            },
            activate: (id, shape) => {
                const start = performance.now();
                status.activations++;
                const handle = getHandle(id)!;
                const body = rigidBody.create(api.world, { shape, motionType: MotionType.STATIC, objectLayer: api.staticObjectLayer,
                    friction: handle.friction, userData: { nodeId: id } });
                api.register(id, body, { object: handle.object.transform ?? undefined, motionType: MotionType.STATIC, sensor: false });
                status.maxActivationMs = Math.max(status.maxActivationMs, performance.now() - start);
            },
            deactivate: id => api.unregister(id),
            report: (id, state, error) => {
                const handle = getHandle(id);
                if (handle) { handle.state = state; handle.error = error ?? null; }
            },
        });
        const revisions = new Map<string, string>();
        const bounds = new Map<string, Box3>();
        const vertex = new Vector3();
        tick.current = camera => {
            const start = performance.now();
            const targets = [];
            const present = new Set<string>();
            for (const { key: id, value: handle } of latest.current) {
                if (handle.problem) continue;
                const surface = handle.object.getComponent(TERRAIN_SURFACE_COMPONENT);
                if (!surface?.mesh) {
                    handle.error = handle.object.getComponent(TERRAIN_FAILURE_COMPONENT);
                    handle.state = handle.error ? 'error' : 'waiting'; continue;
                }
                const mesh = surface.mesh;
                present.add(id);
                mesh.updateWorldMatrix(true, false);
                const geometry = mesh.geometry;
                const revision = `${geometry.uuid}:${mesh.matrixWorld.elements.join(',')}:${handle.friction}`;
                if (revisions.get(id) !== revision) {
                    const matrix = mesh.matrixWorld.clone();
                    inputs.set(id, () => {
                        const positions: number[] = [], indices: number[] = [];
                        const attribute = geometry.attributes.position;
                        for (let i = 0; i < attribute.count; i++) {
                            vertex.fromBufferAttribute(attribute, i).applyMatrix4(matrix);
                            positions.push(vertex.x, vertex.y, vertex.z);
                        }
                        for (let i = 0; i < (geometry.index?.count ?? attribute.count); i++) indices.push(geometry.index ? geometry.index.getX(i) : i);
                        if (matrix.determinant() < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
                        return { positions, indices };
                    });
                    revisions.set(id, revision);
                    if (!geometry.boundingBox) geometry.computeBoundingBox();
                    bounds.set(id, geometry.boundingBox!.clone().applyMatrix4(matrix));
                }
                targets.push({ id, revision, distance: bounds.get(id)!.distanceToPoint(camera) });
            }
            for (const id of revisions.keys()) if (!present.has(id)) { revisions.delete(id); inputs.delete(id); bounds.delete(id); }
            scheduler.update(targets);
            status.prepared = scheduler.preparedCount;
            status.active = scheduler.activeIds.length; status.ready = scheduler.ready;
            status.maxUpdateMs = Math.max(status.maxUpdateMs, performance.now() - start);
        };
        return () => { tick.current = null; scheduler.dispose(); worker.terminate(); pending?.reject(new Error('Terrain preparation stopped')); states.delete(scene); };
    }, [api, scene, hasTargets, activeLimit]);
    useFrame(state => { state.camera.getWorldPosition(position.current); tick.current?.(position.current); }, -4);
    return null;
}
