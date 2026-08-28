import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { MathUtils, Vector3, type Camera } from 'three';
import { useNode, usePrefab } from '../SceneContext';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, NumberField, SelectField } from './Input';

export const CAMERA_POSITION_ROUTE_HANDLE = 'camera-position-route';

export interface CameraPositionRoute {
    setWorldPosition(position: Vector3, alpha?: number): void;
}

const CAMERA_PROJECTION_OPTIONS = [
    { value: 'perspective', label: 'Perspective' },
    { value: 'orthographic', label: 'Orthographic' },
] as const;

const cameraDefaults = {
    projection: 'perspective' as CameraProjection,
    fov: 50,
    near: 0.1,
    zoom: 1,
    far: 1000,
    orthographicSize: 10,
    lockX: false,
    lockY: false,
    lockZ: false,
};

type CameraProjection = typeof CAMERA_PROJECTION_OPTIONS[number]['value'];
type CameraProperties = {
    projection?: CameraProjection;
    fov?: number;
    near?: number;
    zoom?: number;
    far?: number;
    orthographicSize?: number;
    lockX?: boolean;
    lockY?: boolean;
    lockZ?: boolean;
};

function CameraComponentEditor({ properties, update }: ComponentEditorProps<CameraProperties>) {
    const values = { ...cameraDefaults, ...properties };
    const projection = values.projection ?? cameraDefaults.projection;

    return (
        <FieldGroup>
            <SelectField
                name="projection"
                label="Projection"
                values={values}
                onChange={update}
                fallback={cameraDefaults.projection}
                options={[...CAMERA_PROJECTION_OPTIONS]}
            />
            {projection === 'perspective' ? (
                <NumberField
                    name="fov"
                    label="FOV"
                    values={values}
                    onChange={update}
                    fallback={50}
                    min={1}
                    max={179}
                    step={1}
                />
            ) : null}
            {projection === 'orthographic' ? (
                <NumberField
                    name="orthographicSize"
                    label="Ortho Size"
                    values={values}
                    onChange={update}
                    fallback={cameraDefaults.orthographicSize}
                    min={0.01}
                    step={0.1}
                />
            ) : null}
            <NumberField
                name="near"
                label="Near"
                values={values}
                onChange={update}
                fallback={0.1}
                min={0.001}
                step={0.1}
            />
            <NumberField
                name="zoom"
                label="Zoom"
                values={values}
                onChange={update}
                fallback={1}
                min={0.01}
                step={0.1}
            />
            <NumberField
                name="far"
                label="Far"
                values={values}
                onChange={update}
                fallback={1000}
                min={0.1}
                step={1}
            />
            <BooleanField name="lockX" label="Lock X" values={values} onChange={update} fallback={false} />
            <BooleanField name="lockY" label="Lock Y" values={values} onChange={update} fallback={false} />
            <BooleanField name="lockZ" label="Lock Z" values={values} onChange={update} fallback={false} />
        </FieldGroup>
    );
}

function CameraComponentView({ properties, children }: ComponentViewProps<CameraProperties>) {
    const { editMode, nodeId } = useNode();
    const prefab = usePrefab();
    const { size } = useThree();
    const merged = { ...cameraDefaults, ...properties };
    const projection = merged.projection ?? cameraDefaults.projection;
    const fov = merged.fov;
    const near = merged.near;
    const zoom = merged.zoom;
    const far = merged.far;
    const orthographicSize = merged.orthographicSize;
    const lockX = merged.lockX;
    const lockY = merged.lockY;
    const lockZ = merged.lockZ;
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const halfHeight = orthographicSize / 2;
    const halfWidth = halfHeight * aspect;
    const cameraRef = useRef<Camera | null>(null);
    const lockedWorldPosition = useRef(new Vector3());
    const currentWorldPosition = useRef(new Vector3());
    const routedWorldPosition = useRef(new Vector3());
    const routedLocalPosition = useRef(new Vector3());
    const setCameraRef = useCallback((camera: Camera | null) => {
        cameraRef.current = camera;
    }, []);

    useLayoutEffect(() => {
        const camera = cameraRef.current;
        if (!camera) return;
        camera.updateWorldMatrix(true, false);
        camera.getWorldPosition(lockedWorldPosition.current);
    }, [projection]);

    const positionRoute = useMemo<CameraPositionRoute>(() => ({
        setWorldPosition(position, alpha = 1) {
            const camera = cameraRef.current;
            if (!camera) return;

            camera.updateWorldMatrix(true, false);
            camera.getWorldPosition(currentWorldPosition.current);
            routedWorldPosition.current
                .copy(currentWorldPosition.current)
                .lerp(position, MathUtils.clamp(alpha, 0, 1));

            if (lockX) routedWorldPosition.current.x = lockedWorldPosition.current.x;
            if (lockY) routedWorldPosition.current.y = lockedWorldPosition.current.y;
            if (lockZ) routedWorldPosition.current.z = lockedWorldPosition.current.z;

            if (camera.parent) {
                routedLocalPosition.current.copy(routedWorldPosition.current);
                camera.parent.worldToLocal(routedLocalPosition.current);
                camera.position.copy(routedLocalPosition.current);
            } else {
                camera.position.copy(routedWorldPosition.current);
            }
            camera.updateMatrixWorld();
        },
    }), [lockX, lockY, lockZ]);

    useEffect(() => {
        if (editMode) return;
        prefab.registerHandle(nodeId, CAMERA_POSITION_ROUTE_HANDLE, positionRoute);
        return () => prefab.registerHandle(nodeId, CAMERA_POSITION_ROUTE_HANDLE, null);
    }, [editMode, nodeId, positionRoute, prefab]);

    if (editMode) return (
        <group>
            <mesh>
                <boxGeometry args={[0.3, 0.3, 0.5]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
            <mesh position={[0, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.08, 0.16, 16]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
            {children}
        </group>
    );

    if (projection === 'orthographic') {
        return (
            <OrthographicCamera
                ref={setCameraRef}
                makeDefault
                near={near}
                zoom={zoom}
                far={far}
                left={-halfWidth}
                right={halfWidth}
                top={halfHeight}
                bottom={-halfHeight}
            >
                {children}
            </OrthographicCamera>
        );
    }

    return (
        <PerspectiveCamera
            ref={setCameraRef}
            makeDefault
            fov={fov}
            near={near}
            zoom={zoom}
            far={far}
        >
            {children}
        </PerspectiveCamera>
    );
}

const CameraComponent: Component<CameraProperties> = {
    name: 'Camera',
    Editor: CameraComponentEditor,
    View: CameraComponentView,
    properties: {
        projection: { type: 'select', default: cameraDefaults.projection, options: CAMERA_PROJECTION_OPTIONS },
        fov: { default: cameraDefaults.fov, min: 1, max: 179, step: 1 },
        near: { default: cameraDefaults.near, min: 0.001, step: 0.1 },
        zoom: { default: cameraDefaults.zoom, min: 0.01, step: 0.1 },
        far: { default: cameraDefaults.far, min: 0.1, step: 1 },
        orthographicSize: { default: cameraDefaults.orthographicSize, min: 0.01, step: 0.1 },
        lockX: { type: 'boolean', default: cameraDefaults.lockX },
        lockY: { type: 'boolean', default: cameraDefaults.lockY },
        lockZ: { type: 'boolean', default: cameraDefaults.lockZ },
    },
};

export default CameraComponent;
