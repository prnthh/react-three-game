import { OrthographicCamera as DreiOrthographicCamera, PerspectiveCamera as DreiPerspectiveCamera, useHelper } from '@react-three/drei';

import { useThree } from '@react-three/fiber';

import { useRef } from 'react';

import { CameraHelper, MathUtils, type OrthographicCamera, type PerspectiveCamera } from 'three';

import { useNode } from '../SceneContext';

import type { Component, ComponentViewProps } from './ComponentRegistry';

export const CAMERA_PROJECTION_OPTIONS = [
    { value: 'perspective', label: 'Perspective' },
    { value: 'orthographic', label: 'Orthographic' },
] as const;

export const CAMERA_DEFAULTS = {
    projection: 'perspective' as CameraProjection,
    fov: 50,
    near: 0.1,
    zoom: 1,
    far: 1000,
    orthographicSize: 10,
    focus: 10,
    filmGauge: 35,
    filmOffset: 0,
} as const;

export type CameraProjection = typeof CAMERA_PROJECTION_OPTIONS[number]['value'];

export type CameraProperties = {
    projection?: CameraProjection;
    fov?: number;
    near?: number;
    zoom?: number;
    far?: number;
    orthographicSize?: number;
    focus?: number;
    filmGauge?: number;
    filmOffset?: number;
};

function CameraComponentView({ properties, enabled, children }: ComponentViewProps<CameraProperties>) {
    const { editMode, isSelected, preparing } = useNode();
    const { size } = useThree();
    const merged = properties;
    const projection = merged.projection;
    const fov = MathUtils.clamp(merged.fov, 1, 179);
    const near = Math.max(0.001, merged.near);
    const zoom = Math.max(0.01, merged.zoom);
    const far = Math.max(near + 0.001, merged.far);
    const orthographicSize = Math.max(0.01, merged.orthographicSize);
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const halfHeight = orthographicSize / 2;
    const halfWidth = halfHeight * aspect;
    const orthographicCameraRef = useRef<OrthographicCamera>(null!);
    const perspectiveCameraRef = useRef<PerspectiveCamera>(null!);
    const cameraRef = projection === 'orthographic' ? orthographicCameraRef : perspectiveCameraRef;

    useHelper(editMode && isSelected ? cameraRef : null, CameraHelper);

    const editorGizmo = editMode ? (
        <>
            <mesh>
                <boxGeometry args={[0.3, 0.3, 0.5]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
            <mesh position={[0, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.08, 0.16, 16]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
        </>
    ) : null;

    if (projection === 'orthographic') {
        return (
            <group>
                <DreiOrthographicCamera
                    ref={orthographicCameraRef}
                    makeDefault={enabled && !editMode && !preparing}
                    near={near}
                    zoom={zoom}
                    far={far}
                    left={-halfWidth}
                    right={halfWidth}
                    top={halfHeight}
                    bottom={-halfHeight}
                >
                    {children}
                </DreiOrthographicCamera>
                {editorGizmo}
            </group>
        );
    }

    return (
        <group>
            <DreiPerspectiveCamera
                ref={perspectiveCameraRef}
                makeDefault={enabled && !editMode && !preparing}
                fov={fov}
                near={near}
                zoom={zoom}
                far={far}
                focus={Math.max(0.001, merged.focus)}
                filmGauge={Math.max(0.01, merged.filmGauge)}
                filmOffset={merged.filmOffset}
            >
                {children}
            </DreiPerspectiveCamera>
            {editorGizmo}
        </group>
    );
}

const CameraComponent: Component<CameraProperties> = {
    renderWhenDisabled: true,
    name: 'Camera',
    slot: 'object',
    View: CameraComponentView,
    properties: {
        projection: { type: 'select', default: CAMERA_DEFAULTS.projection, options: CAMERA_PROJECTION_OPTIONS },
        fov: { default: CAMERA_DEFAULTS.fov, min: 1, max: 179, step: 1 },
        near: { default: CAMERA_DEFAULTS.near, min: 0.001, step: 0.1 },
        zoom: { default: CAMERA_DEFAULTS.zoom, min: 0.01, step: 0.1 },
        far: { default: CAMERA_DEFAULTS.far, min: 0.1, step: 1 },
        orthographicSize: { default: CAMERA_DEFAULTS.orthographicSize, min: 0.01, step: 0.1 },
        focus: { default: CAMERA_DEFAULTS.focus, min: 0.001, step: 0.1 },
        filmGauge: { default: CAMERA_DEFAULTS.filmGauge, min: 0.01, step: 1 },
        filmOffset: { default: CAMERA_DEFAULTS.filmOffset, step: 0.1 },
    },
};

export default CameraComponent;
