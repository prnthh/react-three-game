import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';
import { PrefabEditorMode, useGameObject, useScene } from '../SceneContext';
import type { Component, ComponentViewProps } from './ComponentRegistry';

export type CameraFollowProperties = {
    targetId?: string;
    positionOffset?: [number, number, number];
    targetOffset?: [number, number, number];
    followSpeed?: number;
};

function CameraFollowView({ properties, children }: ComponentViewProps<CameraFollowProperties>) {
    const camera = useGameObject();
    const targetObject = useGameObject(properties.targetId.trim());
    const { mode } = useScene();
    const targetPosition = useRef(new Vector3());
    const cameraWorldPosition = useRef(new Vector3());
    const desiredWorldPosition = useRef(new Vector3());
    const localPosition = useRef(new Vector3());
    const lookAtPosition = useRef(new Vector3());

    useFrame((_, delta) => {
        if (mode !== PrefabEditorMode.Play) return;
        const cameraObject = camera.transform;
        const target = targetObject.transform;
        if (!cameraObject || !target) return;

        target.getWorldPosition(targetPosition.current);
        const positionOffset = properties.positionOffset;
        desiredWorldPosition.current.set(positionOffset[0], positionOffset[1], positionOffset[2]).add(targetPosition.current);
        cameraObject.getWorldPosition(cameraWorldPosition.current);
        cameraWorldPosition.current.lerp(
            desiredWorldPosition.current,
            1 - Math.exp(-Math.max(0, properties.followSpeed) * delta),
        );
        localPosition.current.copy(cameraWorldPosition.current);
        if (cameraObject.parent) cameraObject.parent.worldToLocal(localPosition.current);
        cameraObject.position.copy(localPosition.current);

        const targetOffset = properties.targetOffset;
        lookAtPosition.current.set(targetOffset[0], targetOffset[1], targetOffset[2]).add(targetPosition.current);
        // Node objects are groups: lookAt aims +Z, while the child camera looks down -Z.
        cameraObject.lookAt(lookAtPosition.current);
        cameraObject.rotateY(Math.PI);
    }, 0);

    return <>{children}</>;
}

const CameraFollowComponent: Component<CameraFollowProperties> = {
    name: "CameraFollow",
    View: CameraFollowView,
    properties: {
        targetId: { type: "string", default: "" },
        positionOffset: { type: "vector3", default: [0, 16, 20] },
        targetOffset: { type: "vector3", default: [0, 1, 0] },
        followSpeed: { default: 7.5, min: 0, step: 0.5 },
    },
};

export default CameraFollowComponent;
