import { Component, FieldRenderer, FieldDefinition } from "react-three-game";

type RotationAxis = 'x' | 'y' | 'z';
type RotatorProperties = {
    speed?: number;
    axis?: RotationAxis;
};

const rotatorFields: FieldDefinition[] = [
    { name: 'speed', type: 'number', label: 'Rotation Speed', step: 0.1 },
    {
        name: 'axis',
        type: 'select',
        label: 'Rotation Axis',
        options: [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
        ],
    },
];

function RotatorComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return (
        <FieldRenderer
            fields={rotatorFields}
            values={component.properties}
            onChange={onUpdate}
        />
    );
}

const RotatorComponent: Component = {
    name: 'Rotator',
    Editor: RotatorComponentEditor,
    create(ctx) {
        return {
            update(dt) {
                const speed = ctx.component.get<number>('speed') ?? 1.0;
                const axis = ctx.component.get<RotationAxis>('axis') ?? 'y';
                ctx.object.rotation[axis] += dt * speed;
            },
        };
    },
    defaultProperties: {
        speed: 1.0,
        axis: 'y'
    }
};

export default RotatorComponent;
