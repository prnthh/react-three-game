import { OrthographicCamera, PerspectiveCamera, useHelper } from '@react-three/drei';
import { useRef } from 'react';
import { CameraHelper } from 'three';
import type { OrthographicCamera as ThreeOrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useNode } from '../assetRuntime';
import type { Component, ComponentViewProps } from './ComponentRegistry';
import { FieldGroup, NumberField, SelectField } from './Input';
import type { ComponentData } from '../types';

const CAMERA_PROJECTION_OPTIONS = [
    { value: 'perspective', label: 'Perspective' },
    { value: 'orthographic', label: 'Orthographic' },
] as const;

const cameraDefaults = {
    projection: 'perspective',
    fov: 50,
    near: 0.1,
    zoom: 1,
    far: 1000,
    orthographicSize: 10,
};

type CameraProjection = typeof CAMERA_PROJECTION_OPTIONS[number]['value'];
type CameraProperties = {
    projection?: CameraProjection;
    fov?: number;
    near?: number;
    zoom?: number;
    far?: number;
    orthographicSize?: number;
} & Record<string, unknown>;

type CameraComponentData = ComponentData & {
    properties: CameraProperties;
};

function CameraComponentEditor({ component, onUpdate }: { component: CameraComponentData; onUpdate: (newComp: Partial<CameraProperties>) => void }) {
    const values = { ...cameraDefaults, ...component.properties };
    const projection = values.projection ?? cameraDefaults.projection;

    return (
        <FieldGroup>
            <SelectField
                name="projection"
                label="Projection"
                values={values}
                onChange={onUpdate}
                fallback={cameraDefaults.projection}
                options={[...CAMERA_PROJECTION_OPTIONS]}
            />
            {projection === 'perspective' ? (
                <NumberField
                    name="fov"
                    label="FOV"
                    values={values}
                    onChange={onUpdate}
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
                    onChange={onUpdate}
                    fallback={cameraDefaults.orthographicSize}
                    min={0.01}
                    step={0.1}
                />
            ) : null}
            <NumberField
                name="near"
                label="Near"
                values={values}
                onChange={onUpdate}
                fallback={0.1}
                min={0.001}
                step={0.1}
            />
            <NumberField
                name="zoom"
                label="Zoom"
                values={values}
                onChange={onUpdate}
                fallback={1}
                min={0.01}
                step={0.1}
            />
            <NumberField
                name="far"
                label="Far"
                values={values}
                onChange={onUpdate}
                fallback={1000}
                min={0.1}
                step={1}
            />
        </FieldGroup>
    );
}

function CameraComponentView({ properties, children }: ComponentViewProps<CameraProperties>) {
    const { editMode, isSelected } = useNode();
    const { size } = useThree();
    const merged = { ...cameraDefaults, ...properties };
    const projection = merged.projection ?? cameraDefaults.projection;
    const fov = merged.fov;
    const near = merged.near;
    const zoom = merged.zoom;
    const far = merged.far;
    const orthographicSize = merged.orthographicSize;
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const halfHeight = orthographicSize / 2;
    const halfWidth = halfHeight * aspect;
    const perspectiveCameraRef = useRef<ThreePerspectiveCamera>(null);
    const orthographicCameraRef = useRef<ThreeOrthographicCamera>(null);
    const activeCamera = projection === 'orthographic'
        ? orthographicCameraRef.current
        : perspectiveCameraRef.current;
    const helperTarget = editMode && isSelected && activeCamera
        ? { current: activeCamera }
        : null;
    useHelper(
        helperTarget,
        CameraHelper
    );

    useFrame(() => {
        if (!editMode || !isSelected) return;

        if (projection === 'orthographic' && orthographicCameraRef.current) {
            orthographicCameraRef.current.updateProjectionMatrix();
            orthographicCameraRef.current.updateMatrixWorld();
            return;
        }

        if (perspectiveCameraRef.current) {
            perspectiveCameraRef.current.updateProjectionMatrix();
            perspectiveCameraRef.current.updateMatrixWorld();
        }
    });

    const helperContent = editMode ? (
        <group>
            <mesh>
                <boxGeometry args={[0.3, 0.3, 0.5]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
            <mesh position={[0, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.08, 0.16, 16]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
        </group>
    ) : null;

    if (projection === 'orthographic') {
        return (
            <OrthographicCamera
                ref={orthographicCameraRef}
                makeDefault={!editMode}
                near={near}
                zoom={zoom}
                far={far}
                left={-halfWidth}
                right={halfWidth}
                top={halfHeight}
                bottom={-halfHeight}
            >
                {helperContent}
                {children}
            </OrthographicCamera>
        );
    }

    return (
        <PerspectiveCamera
            ref={perspectiveCameraRef}
            makeDefault={!editMode}
            fov={fov}
            near={near}
            zoom={zoom}
            far={far}
        >
            {helperContent}
            {children}
        </PerspectiveCamera>
    );
}

const CameraComponent: Component = {
    name: 'Camera',
    Editor: CameraComponentEditor,
    View: CameraComponentView,
    defaultProperties: cameraDefaults,
};

export default CameraComponent;