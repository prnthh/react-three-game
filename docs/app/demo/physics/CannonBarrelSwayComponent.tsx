import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Component, FieldDefinition, FieldRenderer, useCurrentNodeObject } from "react-three-game";

type CannonBarrelSwayProperties = {
    yawAmplitude?: number;
    pitchAmplitude?: number;
    speed?: number;
};

const cannonBarrelSwayFields: FieldDefinition[] = [
    { name: "yawAmplitude", type: "number", label: "Yaw Amplitude", step: 0.01 },
    { name: "pitchAmplitude", type: "number", label: "Pitch Amplitude", step: 0.01 },
    { name: "speed", type: "number", label: "Speed", min: 0.1, step: 0.1 },
];

function CannonBarrelSwayEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return <FieldRenderer fields={cannonBarrelSwayFields} values={component.properties} onChange={onUpdate} />;
}

function CannonBarrelSwayView({ properties, children }: { properties: CannonBarrelSwayProperties; children?: React.ReactNode }) {
    const objectRef = useCurrentNodeObject();
    const baseRotationRef = useRef<{ x: number; y: number; z: number } | null>(null);
    const elapsedRef = useRef(0);

    useEffect(() => {
        return () => {
            const object = objectRef.current;
            const baseRotation = baseRotationRef.current;
            if (!object || !baseRotation) return;
            object.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
        };
    }, [objectRef]);

    useFrame((_, delta) => {
        const object = objectRef.current;
        if (!object) return;

        if (!baseRotationRef.current) {
            baseRotationRef.current = {
                x: object.rotation.x,
                y: object.rotation.y,
                z: object.rotation.z,
            };
        }

        const baseRotation = baseRotationRef.current;
        if (!baseRotation) return;

        elapsedRef.current += delta;

        const speed = properties.speed ?? 1.4;
        const yawAmplitude = properties.yawAmplitude ?? 0.2;
        const pitchAmplitude = properties.pitchAmplitude ?? 0.08;
        const wave = elapsedRef.current * speed;

        object.rotation.set(
            baseRotation.x + Math.sin(wave * 0.7) * pitchAmplitude,
            baseRotation.y + Math.sin(wave) * yawAmplitude,
            baseRotation.z,
        );
    });

    return <>{children}</>;
}

const CannonBarrelSwayComponent: Component = {
    name: "CannonBarrelSway",
    Editor: CannonBarrelSwayEditor,
    View: CannonBarrelSwayView,
    defaultProperties: {
        yawAmplitude: 0.2,
        pitchAmplitude: 0.08,
        speed: 1.4,
    },
};

export default CannonBarrelSwayComponent;