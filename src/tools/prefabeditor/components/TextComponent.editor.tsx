import type { ComponentEditorProps } from "./ComponentRegistry";
import { ColorField, FieldGroup, NumberField, SelectField, StringField } from "./Input";
import { TextProperties } from "./TextComponent";

function TextComponentEditor({ properties, update }: ComponentEditorProps<TextProperties>) {
    return (
        <FieldGroup>
            <StringField
                name="text"
                label="Text"
                values={properties}
                onChange={update}
                placeholder="Enter text..."
            />
            <ColorField
                name="color"
                label="Color"
                values={properties}
                onChange={update}
            />
            <StringField
                name="font"
                label="Font"
                values={properties}
                onChange={update}
                placeholder="/fonts/NotoSans-Regular.ttf"
            />
            <NumberField
                name="size"
                label="Size"
                values={properties}
                onChange={update}
                min={0.01}
                step={0.1}
            />
            <NumberField
                name="depth"
                label="Depth"
                values={properties}
                onChange={update}
                min={0}
                step={0.1}
            />
            <NumberField
                name="width"
                label="Width"
                values={properties}
                onChange={update}
                min={0}
                step={0.5}
            />
            <SelectField
                name="align"
                label="Align"
                values={properties}
                onChange={update}
                options={[
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                ]}
            />
        </FieldGroup>
    );
}

export default TextComponentEditor;
