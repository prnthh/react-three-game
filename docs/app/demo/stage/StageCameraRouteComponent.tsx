import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import {
    createNodeComponentType,
    useNode,
    useRegisterNodeComponent,
    type Component,
    type ComponentViewProps,
} from "react-three-game";

export interface StageCameraPositionRoute {
    setWorldPosition(position: Vector3, alpha?: number): void;
}

export const STAGE_CAMERA_POSITION_ROUTE = createNodeComponentType<StageCameraPositionRoute>("StageCameraPositionRoute");

type StageCameraRouteProperties = {
    lockX?: boolean;
    lockY?: boolean;
    lockZ?: boolean;
};

function StageCameraRouteView({ properties, children }: ComponentViewProps<StageCameraRouteProperties>) {
    const { editMode } = useNode();
    const camera = useThree(state => state.camera);
    const lockedWorldPosition = useRef(new Vector3());
    const currentWorldPosition = useRef(new Vector3());
    const routedWorldPosition = useRef(new Vector3());
    const routedLocalPosition = useRef(new Vector3());

    useLayoutEffect(() => {
        camera.updateWorldMatrix(true, false);
        camera.getWorldPosition(lockedWorldPosition.current);
    }, [camera]);

    const route = useMemo<StageCameraPositionRoute>(() => ({
        setWorldPosition(position, alpha = 1) {
            camera.updateWorldMatrix(true, false);
            camera.getWorldPosition(currentWorldPosition.current);
            routedWorldPosition.current
                .copy(currentWorldPosition.current)
                .lerp(position, MathUtils.clamp(alpha, 0, 1));
            if (properties.lockX) routedWorldPosition.current.x = lockedWorldPosition.current.x;
            if (properties.lockY) routedWorldPosition.current.y = lockedWorldPosition.current.y;
            if (properties.lockZ) routedWorldPosition.current.z = lockedWorldPosition.current.z;
            if (camera.parent) {
                routedLocalPosition.current.copy(routedWorldPosition.current);
                camera.parent.worldToLocal(routedLocalPosition.current);
                camera.position.copy(routedLocalPosition.current);
            } else {
                camera.position.copy(routedWorldPosition.current);
            }
            camera.updateMatrixWorld();
        },
    }), [camera, properties.lockX, properties.lockY, properties.lockZ]);

    useRegisterNodeComponent(STAGE_CAMERA_POSITION_ROUTE, editMode ? null : route);
    return <>{children}</>;
}

const StageCameraRouteComponent: Component<StageCameraRouteProperties> = {
    name: "StageCameraRoute",
    View: StageCameraRouteView,
    properties: {
        lockX: { type: "boolean", default: false },
        lockY: { type: "boolean", default: false },
        lockZ: { type: "boolean", default: false },
    },
};

export default StageCameraRouteComponent;
