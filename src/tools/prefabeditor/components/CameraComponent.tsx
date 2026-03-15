import { PerspectiveCamera, useHelper } from '@react-three/drei';
import { useRef } from 'react';
import { CameraHelper, PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { Component } from './ComponentRegistry';
import { FieldGroup, NumberField } from './Input';

function CameraComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return (
        <FieldGroup>
            <NumberField
                name="fov"
                label="FOV"
                values={component.properties}
                onChange={onUpdate}
                fallback={50}
                min={1}
                max={179}
                step={1}
            />
            <NumberField
                name="near"
                label="Near"
                values={component.properties}
                onChange={onUpdate}
                fallback={0.1}
                min={0.001}
                step={0.1}
            />
            <NumberField
                name="zoom"
                label="Zoom"
                values={component.properties}
                onChange={onUpdate}
                fallback={1}
                min={0.01}
                step={0.1}
            />
            <NumberField
                name="far"
                label="Far"
                values={component.properties}
                onChange={onUpdate}
                fallback={1000}
                min={0.1}
                step={1}
            />
        </FieldGroup>
    );
}

function CameraComponentView({ properties, editMode, isSelected }: { properties: any; editMode?: boolean; isSelected?: boolean }) {
    const fov = properties?.fov ?? 50;
    const near = properties?.near ?? 0.1;
    const zoom = properties?.zoom ?? 1;
    const far = properties?.far ?? 1000;
    const cameraRef = useRef<ThreePerspectiveCamera>(null);

    useHelper(editMode && isSelected ? (cameraRef as React.RefObject<ThreePerspectiveCamera>) : null, CameraHelper);

    return (
        <>
            <PerspectiveCamera ref={cameraRef} makeDefault={!editMode} fov={fov} near={near} zoom={zoom} far={far} />
            {editMode && !isSelected ? (
                <mesh>
                    <boxGeometry args={[0.34, 0.22, 0.18]} />
                    <meshBasicMaterial color="#22d3ee" wireframe />
                </mesh>
            ) : null}
        </>
    );
}

const CameraComponent: Component = {
    name: 'Camera',
    Editor: CameraComponentEditor,
    View: CameraComponentView,
    defaultProperties: {},
};

export default CameraComponent;