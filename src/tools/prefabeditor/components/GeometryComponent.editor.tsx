import type { ComponentEditorProps } from "./ComponentRegistry";
import { FieldGroup, NumberField, SelectField } from "./Input";
import { GEOMETRY_ARGS, GeometryProperties, getDefaultArgs } from "./GeometryComponent";

function GeometryComponentEditor({ properties, update }: ComponentEditorProps<GeometryProperties>) {
    const geometryType = properties.geometryType ?? 'box';
    const schema = GEOMETRY_ARGS[geometryType] ?? GEOMETRY_ARGS.box;
    const args = properties.args ?? getDefaultArgs(geometryType);

    // Handle geometry type change to reset args
    const handleChange = (newValues: Partial<GeometryProperties>) => {
        if (typeof newValues.geometryType === 'string' && newValues.geometryType !== geometryType) {
            update({ geometryType: newValues.geometryType, args: getDefaultArgs(newValues.geometryType) });
        } else {
            update(newValues);
        }
    };

    const updateArg = (index: number, value: number) => {
        const next = [...args];
        next[index] = value;
        update({ args: next });
    };

    return (
        <FieldGroup>
            <SelectField
                name="geometryType"
                label="Type"
                values={properties}
                onChange={handleChange}
                options={[
                    { value: 'box', label: 'Box' },
                    { value: 'sphere', label: 'Sphere' },
                    { value: 'plane', label: 'Plane' },
                    { value: 'cylinder', label: 'Cylinder' },
                    { value: 'torus', label: 'Torus' },
                ]}
            />
            {schema.fields.map((field, index) => (
                <NumberField
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    values={{ [field.name]: args[index] ?? field.defaultValue }}
                    onChange={(next) => updateArg(index, next[field.name] ?? field.defaultValue)}
                    fallback={field.defaultValue}
                    min={field.min}
                    step={field.step}
                />
            ))}
        </FieldGroup>
    );
}

export default GeometryComponentEditor;
