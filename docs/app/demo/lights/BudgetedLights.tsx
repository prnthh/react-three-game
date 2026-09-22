import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, Frustum, Group, Matrix4, PointLight, Sphere, SpotLight, Vector3 } from 'three';
import { selectLightSlots } from './selectLightSlots';
import { scoreLight } from './scoreLight';

/** World-space authoring data. Positions/targets may be mutated by gameplay each frame. */
export interface RuntimeLight {
    id: string;
    type: 'point' | 'spot';
    position: Vector3;
    color: Color;
    intensity: number;
    range: number;
    target?: Vector3;
    angle?: number;
}

export interface LightBudget {
    point: number;
    spot: number;
}

export interface LightBudgetStats {
    contributing: number;
}

/** Fixed physical light slots avoid rebuilding the lighting shader as selections change. */
export function BudgetedLights({ lights, budget, onStats }: {
    lights: readonly RuntimeLight[];
    budget: LightBudget;
    onStats?: (stats: LightBudgetStats) => void;
}) {
    const pool = useMemo(() => {
        const group = new Group();
        const slots = (['point', 'spot'] as const).flatMap(type =>
            Array.from({ length: Math.max(0, Math.floor(budget[type])) }, () => {
                const light = type === 'point' ? new PointLight() : new SpotLight();
                light.intensity = 0;
                light.castShadow = false;
                group.add(light);
                if (light instanceof SpotLight) { light.penumbra = 0.35; group.add(light.target); }
                return { type, light, id: null as string | null };
            }));
        return { group, slots, frustum: new Frustum(), matrix: new Matrix4(), sphere: new Sphere(), eye: new Vector3(), forward: new Vector3() };
    }, [budget.point, budget.spot]);

    useEffect(() => () => pool.slots.forEach(({ light }) => light.dispose()), [pool]);

    useFrame(({ camera }) => {
        camera.updateWorldMatrix(true, false);
        pool.eye.setFromMatrixPosition(camera.matrixWorld);
        camera.getWorldDirection(pool.forward);
        pool.frustum.setFromProjectionMatrix(pool.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
        const byId = new Map(lights.map(light => [light.id, light]));
        let contributing = 0;
        for (const type of ['point', 'spot'] as const) {
            const candidates = lights.filter(light => {
                pool.sphere.set(light.position, light.range);
                return light.type === type && light.range > 0 && light.intensity > 0 && pool.frustum.intersectsSphere(pool.sphere);
            }).map(light => ({
                id: light.id,
                score: scoreLight(light.position, light.range,
                    light.intensity * Math.max(light.color.r, light.color.g, light.color.b),
                    pool.eye, pool.forward),
            }));
            const slots = pool.slots.filter(slot => slot.type === type);
            const selected = selectLightSlots(candidates, slots.map(slot => slot.id), slots.length);
            slots.forEach((slot, index) => {
                const id = selected[index];
                const source = id ? byId.get(id) : undefined;
                slot.id = id;
                if (!source) { slot.light.intensity = 0; return; }
                contributing++;
                const light = slot.light;
                light.position.copy(source.position);
                light.color.copy(source.color);
                light.intensity = source.intensity;
                light.distance = source.range;
                if (light instanceof SpotLight) {
                    light.angle = source.angle ?? Math.PI / 4;
                    light.target.position.copy(source.target ?? source.position).y = source.target?.y ?? 0;
                }
            });
        }
        onStats?.({ contributing });
    }, -1);

    return <primitive object={pool.group} />;
}
