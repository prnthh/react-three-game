import type { ComponentEditorProps } from './ComponentRegistry';
import { BooleanField, FieldRenderer, NumberInput, StringField } from './Input';
import { SpriteProps } from "./SpriteComponent";

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

function SpriteComponentEditor({ properties, update }: ComponentEditorProps<SpriteProps>) {
    return (
        <>
            <FieldRenderer
                fields={[{
                    name: 'center',
                    type: 'custom',
                    label: 'Center',
                    render: ({ value, onChange }) => (
                        <Vector2Editor value={value} onChange={onChange} min={0} max={1} step={0.01} />
                    ),
                }]}
                values={properties}
                onChange={update}
            />
            <div style={{ marginTop: 8 }}>
                <BooleanField
                    name="emitClickEvent"
                    label="Emit Click Event"
                    values={properties}
                    onChange={update}
                    fallback={false}
                />
                {properties.emitClickEvent ? (
                    <StringField
                        name="clickEventName"
                        label="Click Event Name"
                        values={properties}
                        onChange={update}
                        fallback="node:click"
                    />
                ) : null}
            </div>
        </>
    );
}

export default SpriteComponentEditor;
