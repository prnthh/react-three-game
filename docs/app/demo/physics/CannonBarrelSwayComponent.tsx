import { Component, FieldDefinition, FieldRenderer } from "react-three-game";

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

const CannonBarrelSwayComponent: Component = {
    name: "CannonBarrelSway",
    Editor: CannonBarrelSwayEditor,
    create(ctx) {
        const baseX = ctx.object.rotation.x;
        const baseY = ctx.object.rotation.y;
        const baseZ = ctx.object.rotation.z;
        let elapsed = 0;

        return {
            update(dt) {
                elapsed += dt;

                const speed = ctx.component.get<number>("speed") ?? 1.4;
                const yawAmplitude = ctx.component.get<number>("yawAmplitude") ?? 0.2;
                const pitchAmplitude = ctx.component.get<number>("pitchAmplitude") ?? 0.08;
                const wave = elapsed * speed;

                ctx.object.rotation.set(
                    baseX + Math.sin(wave * 0.7) * pitchAmplitude,
                    baseY + Math.sin(wave) * yawAmplitude,
                    baseZ,
                );
            },
            destroy() {
                ctx.object.rotation.set(baseX, baseY, baseZ);
            },
        };
    },
    defaultProperties: {
        yawAmplitude: 0.2,
        pitchAmplitude: 0.08,
        speed: 1.4,
    },
};

export default CannonBarrelSwayComponent;