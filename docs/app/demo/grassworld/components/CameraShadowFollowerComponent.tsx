import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useRef } from "react";
import { DirectionalLight, Vector3, type Object3D } from "three";
import {
    PrefabEditorMode,
    useNodeObject,
    useScene,
    type Component,
    type ComponentViewProps,
} from "react-three-game";

type CameraShadowFollowerProperties = {
    interval?: number;
    offset?: [number, number, number];
    positionThreshold?: number;
};

const DEFAULT_INTERVAL = 0.25;
const MIN_INTERVAL = 1 / 60;
const DEFAULT_OFFSET: [number, number, number] = [10, 10, 10];
const DEFAULT_POSITION_THRESHOLD = 0.01;

function findDirectionalLight(object: Object3D | null) {
    let result: DirectionalLight | null = null;
    object?.traverse(candidate => {
        if (!result && candidate instanceof DirectionalLight) result = candidate;
    });
    return result;
}

function CameraShadowFollowerView({ properties, children }: ComponentViewProps<CameraShadowFollowerProperties>) {
    const objectRef = useNodeObject();
    const { mode } = useScene();
    const camera = useThree(state => state.camera);
    const elapsedRef = useRef(0);
    const lightRef = useRef<DirectionalLight | null>(null);
    const previousAutoUpdateRef = useRef<boolean | null>(null);
    const cameraWorldPosition = useRef(new Vector3());
    const targetWorldPosition = useRef(new Vector3());

    const restoreShadowState = useCallback(() => {
        if (lightRef.current && previousAutoUpdateRef.current != null) {
            lightRef.current.shadow.autoUpdate = previousAutoUpdateRef.current;
        }
        lightRef.current = null;
        previousAutoUpdateRef.current = null;
        elapsedRef.current = 0;
    }, []);

    useLayoutEffect(() => {
        if (mode !== PrefabEditorMode.Play) restoreShadowState();
    }, [mode, restoreShadowState]);
    useLayoutEffect(() => () => restoreShadowState(), [restoreShadowState]);

    useFrame((_, delta) => {
        if (mode !== PrefabEditorMode.Play) return;
        const object = objectRef.current;
        if (!object) return;
        const light = lightRef.current?.parent ? lightRef.current : findDirectionalLight(object);
        if (!light) return;
        if (lightRef.current !== light) {
            restoreShadowState();
            lightRef.current = light;
            previousAutoUpdateRef.current = light.shadow.autoUpdate;
            light.shadow.autoUpdate = false;
            light.shadow.needsUpdate = true;
            return;
        }

        const interval = Math.max(MIN_INTERVAL, properties.interval ?? DEFAULT_INTERVAL);
        elapsedRef.current += Math.max(0, delta);
        if (elapsedRef.current < interval) return;
        elapsedRef.current %= interval;
        const offset = properties.offset ?? DEFAULT_OFFSET;
        camera.getWorldPosition(cameraWorldPosition.current);
        targetWorldPosition.current.set(offset[0], offset[1], offset[2]).add(cameraWorldPosition.current);
        if (object.parent) object.parent.worldToLocal(targetWorldPosition.current);
        const threshold = Math.max(0, properties.positionThreshold ?? DEFAULT_POSITION_THRESHOLD);
        if (object.position.distanceToSquared(targetWorldPosition.current) <= threshold * threshold) return;
        object.position.copy(targetWorldPosition.current);
        object.updateWorldMatrix(true, true);
        light.shadow.needsUpdate = true;
    });

    return <>{children}</>;
}

const CameraShadowFollowerComponent: Component<CameraShadowFollowerProperties> = {
    name: "CameraShadowFollower",
    View: CameraShadowFollowerView,
    properties: {
        interval: { default: DEFAULT_INTERVAL, min: MIN_INTERVAL, step: 0.05 },
        offset: { type: "vector3", default: DEFAULT_OFFSET },
        positionThreshold: { default: DEFAULT_POSITION_THRESHOLD, min: 0, step: 0.01 },
    },
};

export default CameraShadowFollowerComponent;
