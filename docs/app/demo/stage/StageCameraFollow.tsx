import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { PrefabEditorMode, useNodeObject, usePrefab, useScene, type Component, type ComponentViewProps } from "react-three-game/viewer";
import { OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { PLAYER_NODE_ID } from "./stage";
const UP = new Vector3(0, 1, 0);
const CAMERA_RIGHT = new Vector3(1, 0, 0);
type CameraFollowProperties = { targetNodeId?: string; deadZone?: number; speed?: number; lockX?: boolean; lockY?: boolean; lockZ?: boolean };

function StageCameraFollowView({ properties, children }: ComponentViewProps<CameraFollowProperties>) {
    const { mode } = useScene();
    const prefab = usePrefab();
    const object = useNodeObject();
    const lockedPosition = useRef(new Vector3());
    useLayoutEffect(() => {
        object.current?.getWorldPosition(lockedPosition.current);
    }, [object]);
    const camera = useThree((state) => state.camera);
    const worldPosition = useRef(new Vector3());
    const viewPosition = useRef(new Vector3());
    const projectedPosition = useRef(new Vector3());
    const cameraWorldPosition = useRef(new Vector3());
    const routedWorldPosition = useRef(new Vector3());
    const cameraRight = useRef(new Vector3());
    const cameraUp = useRef(new Vector3());
    const cameraWorldQuaternion = useRef(new Quaternion());

    useFrame((_, delta) => {
        if (mode !== PrefabEditorMode.Play) return;
        const player = prefab.getObject(properties.targetNodeId);
        if (!player) return;
        const node = object.current;
        if (!node) return;

        player.getWorldPosition(worldPosition.current);
        camera.updateMatrixWorld();
        projectedPosition.current.copy(worldPosition.current).project(camera);

        const projectedX = projectedPosition.current.x;
        const projectedY = projectedPosition.current.y;
        if (Math.abs(projectedX) <= properties.deadZone && Math.abs(projectedY) <= properties.deadZone) return;

        viewPosition.current.copy(worldPosition.current).applyMatrix4(camera.matrixWorldInverse);
        let halfWidth = 0;
        let halfHeight = 0;
        if (camera instanceof PerspectiveCamera) {
            halfHeight = -viewPosition.current.z * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
            halfWidth = halfHeight * camera.aspect;
        } else if (camera instanceof OrthographicCamera) {
            halfWidth = (camera.right - camera.left) / (2 * camera.zoom);
            halfHeight = (camera.top - camera.bottom) / (2 * camera.zoom);
        }
        if (halfWidth <= 0 || halfHeight <= 0) return;

        const offsetX = Math.abs(projectedX) > properties.deadZone
            ? (projectedX - Math.sign(projectedX) * properties.deadZone) * halfWidth
            : 0;
        const offsetY = Math.abs(projectedY) > properties.deadZone
            ? (projectedY - Math.sign(projectedY) * properties.deadZone) * halfHeight
            : 0;

        camera.getWorldPosition(cameraWorldPosition.current);
        camera.getWorldQuaternion(cameraWorldQuaternion.current);
        cameraRight.current.copy(CAMERA_RIGHT).applyQuaternion(cameraWorldQuaternion.current);
        cameraUp.current.copy(UP).applyQuaternion(cameraWorldQuaternion.current);
        routedWorldPosition.current
            .copy(cameraWorldPosition.current)
            .addScaledVector(cameraRight.current, offsetX)
            .addScaledVector(cameraUp.current, offsetY);
        routedWorldPosition.current.lerpVectors(cameraWorldPosition.current, routedWorldPosition.current, 1 - Math.exp(-properties.speed * delta));
        if (properties.lockX) routedWorldPosition.current.x = lockedPosition.current.x;
        if (properties.lockY) routedWorldPosition.current.y = lockedPosition.current.y;
        if (properties.lockZ) routedWorldPosition.current.z = lockedPosition.current.z;
        node.parent?.worldToLocal(routedWorldPosition.current);
        node.position.copy(routedWorldPosition.current);
        node.updateMatrixWorld(true);
    }, -2);

    return <>{children}</>;
}

const StageCameraFollow: Component<CameraFollowProperties> = {
    name: "StageCameraFollow",
    View: StageCameraFollowView,
    properties: {
        targetNodeId: { type: "string", default: PLAYER_NODE_ID },
        deadZone: { default: 0.4, min: 0, max: 1 },
        speed: { default: 8, min: 0 },
        lockX: { type: "boolean", default: false },
        lockY: { type: "boolean", default: true },
        lockZ: { type: "boolean", default: true },
    },
};
export default StageCameraFollow;
