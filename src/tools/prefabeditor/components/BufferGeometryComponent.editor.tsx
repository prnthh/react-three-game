import type { ComponentEditorProps } from "./ComponentRegistry";
import { BooleanField, FieldGroup } from "./Input";
import { base, ui } from "../styles";
import { NumericArray, BufferGeometryProperties, DEFAULT_TRIANGLE_POSITIONS, DEFAULT_TRIANGLE_INDICES, DEFAULT_TRIANGLE_UVS, isFiniteNumberArray, normalizeNumberArray } from "./BufferGeometryComponent";

function toAttributeText(value: unknown, fallback: NumericArray) {
    return JSON.stringify(normalizeNumberArray(value, fallback));
}

function parseArrayInput(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const parsed = JSON.parse(trimmed);
    if (!isFiniteNumberArray(parsed)) {
        throw new Error('Expected a JSON array of numbers');
    }

    return parsed;
}

function BufferArrayField({
    label,
    value,
    fallback,
    onChange,
    rows = 4,
}: {
    label: string;
    value: unknown;
    fallback: NumericArray;
    onChange: (next: NumericArray) => void;
    rows?: number;
}) {
    return (
        <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ ...base.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
            </span>
            <textarea
                rows={rows}
                spellCheck={false}
                defaultValue={toAttributeText(value, fallback)}
                onBlur={(event) => {
                    try {
                        onChange(parseArrayInput(event.target.value));
                        event.target.setCustomValidity('');
                    } catch {
                        event.target.setCustomValidity('Expected a JSON array of numbers');
                        event.target.reportValidity();
                    }
                }}
                style={{
                    ...ui.monoTextInput,
                    width: '100%',
                    minHeight: rows * 18,
                    padding: '4px 6px',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                }}
            />
        </label>
    );
}

function BufferGeometryComponentEditor({ properties, update }: ComponentEditorProps<BufferGeometryProperties>) {
    return (
        <FieldGroup>
            <BufferArrayField
                label="Positions"
                value={properties.positions}
                fallback={DEFAULT_TRIANGLE_POSITIONS}
                rows={5}
                onChange={(positions) => update({ positions })}
            />
            <BufferArrayField
                label="Indices"
                value={properties.indices}
                fallback={DEFAULT_TRIANGLE_INDICES}
                onChange={(indices) => update({ indices })}
            />
            <BufferArrayField
                label="Normals"
                value={properties.normals}
                fallback={[]}
                onChange={(normals) => update({ normals })}
            />
            <BufferArrayField
                label="UVs"
                value={properties.uvs}
                fallback={DEFAULT_TRIANGLE_UVS}
                onChange={(uvs) => update({ uvs })}
            />
            <BooleanField
                name="computeVertexNormals"
                label="Compute Normals"
                values={properties}
                onChange={update}
                fallback={true}
            />
        </FieldGroup>
    );
}

export default BufferGeometryComponentEditor;
