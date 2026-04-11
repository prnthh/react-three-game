import { PerspectiveCamera, useHelper } from '@react-three/drei';
import { useRef } from 'react';
import { CameraHelper, Object3D, PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { useFrame } from '@react-three/fiber';
import { useEntityRuntime } from '../runtimeContext';
import { Component } from './ComponentRegistry';
import { FieldGroup, NumberField } from './Input';

const cameraDefaults = {
    fov: 50,
    near: 0.1,
    zoom: 1,
    far: 1000,
};

function CameraComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const values = { ...cameraDefaults, ...component.properties };

    return (
        <FieldGroup>
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

function CameraComponentView({ properties, children }: { properties: any; children?: React.ReactNode }) {
    const { editMode, isSelected } = useEntityRuntime();
    const merged = { ...cameraDefaults, ...properties };
    const fov = merged.fov;
    const near = merged.near;
    const zoom = merged.zoom;
    const far = merged.far;
    const cameraRef = useRef<ThreePerspectiveCamera>(null);
    useHelper(
        editMode && isSelected ? cameraRef as React.RefObject<Object3D> : null,
        CameraHelper
    );

    useFrame(() => {
        if (cameraRef.current && editMode && isSelected) {
            cameraRef.current.updateProjectionMatrix();
            cameraRef.current.updateMatrixWorld();
        }
    });

    return (
        <>
            <PerspectiveCamera
                ref={cameraRef}
                makeDefault={!editMode}
                fov={fov}
                near={near}
                zoom={zoom}
                far={far}
            />
            {editMode ? (
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
            ) : null}
            {children}
        </>
    );
}

const CameraComponent: Component = {
    name: 'Camera',
    Editor: CameraComponentEditor,
    View: CameraComponentView,
    defaultProperties: cameraDefaults,
};

export default CameraComponent;