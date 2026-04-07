import { PerspectiveCamera } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { CameraHelper, PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { useFrame } from '@react-three/fiber';
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

function CameraComponentView({ properties, editMode, isSelected }: { properties: any; editMode?: boolean; isSelected?: boolean }) {
    const merged = { ...cameraDefaults, ...properties };
    const fov = merged.fov;
    const near = merged.near;
    const zoom = merged.zoom;
    const far = merged.far;
    const [camera, setCamera] = useState<ThreePerspectiveCamera | null>(null);
    const cameraHelper = useMemo(
        () => camera ? new CameraHelper(camera) : null,
        [camera]
    );

    useEffect(() => {
        return () => {
            cameraHelper?.dispose();
        };
    }, [cameraHelper]);

    useFrame(() => {
        if (camera && cameraHelper && editMode && isSelected) {
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld();
            cameraHelper.update();
        }
    });

    return (
        <>
            <PerspectiveCamera
                ref={(instance) => setCamera(instance)}
                makeDefault={!editMode}
                fov={fov}
                near={near}
                zoom={zoom}
                far={far}
            />
            {editMode && isSelected && cameraHelper && (
                <primitive object={cameraHelper} />
            )}
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