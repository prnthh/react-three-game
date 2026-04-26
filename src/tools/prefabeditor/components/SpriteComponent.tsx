import type { Component } from './ComponentRegistry';
import type { ComponentData } from '../types';
import { BooleanField, FieldRenderer, NumberInput, StringField } from './Input';
import type { FieldDefinition } from './Input';

export interface SpriteProps {
    center?: [number, number];
    emitClickEvent?: boolean;
    clickEventName?: string;
}

function Vector2Editor({
    value,
    onChange,
    min,
    max,
    step,
}: {
    value: [number, number] | undefined;
    onChange: (value: [number, number]) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <div style={{ display: 'flex', gap: 2 }}>
            <NumberInput
                value={value?.[0] ?? 0}
                onChange={x => onChange([x, value?.[1] ?? 0])}
                min={min}
                max={max}
                step={step}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            />
            <NumberInput
                value={value?.[1] ?? 0}
                onChange={y => onChange([value?.[0] ?? 0, y])}
                min={min}
                max={max}
                step={step}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            />
        </div>
    );
}

function SpriteComponentEditor({
    component,
    onUpdate,
}: {
    component: ComponentData;
    onUpdate: (newComp: Partial<SpriteProps>) => void;
}) {
    const fields: FieldDefinition[] = [
        {
            name: 'center',
            type: 'custom',
            label: 'Center',
            render: ({ value, onChange }) => (
                <Vector2Editor value={value} onChange={onChange} min={0} max={1} step={0.01} />
            ),
        },
    ];

    return (
        <>
            <FieldRenderer fields={fields} values={component.properties} onChange={onUpdate} />
            <div style={{ marginTop: 8 }}>
                <BooleanField
                    name="emitClickEvent"
                    label="Emit Click Event"
                    values={component.properties}
                    onChange={onUpdate}
                    fallback={false}
                />
                {component.properties.emitClickEvent ? (
                    <StringField
                        name="clickEventName"
                        label="Click Event Name"
                        values={component.properties}
                        onChange={onUpdate}
                        fallback="node:click"
                    />
                ) : null}
            </div>
        </>
    );
}

const SpriteComponent: Component = {
    name: 'Sprite',
    Editor: SpriteComponentEditor,
    defaultProperties: {
        center: [0.5, 0.5],
        emitClickEvent: false,
        clickEventName: 'node:click',
    },
};

export default SpriteComponent;
