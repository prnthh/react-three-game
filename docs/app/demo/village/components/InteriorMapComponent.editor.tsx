import { ColorField, FieldGroup, Label, TexturePicker, Vector3Field, useEditorRef, type ComponentEditorProps } from "react-three-game/editor";
import { InteriorMapProperties, DEFAULT_TEXTURE } from "./InteriorMapComponent";

function InteriorMapEditor({ properties, update }: ComponentEditorProps<InteriorMapProperties>) {
    const { basePath } = useEditorRef();
    return <FieldGroup>
        <div>
            <Label>Cube Faces Atlas</Label>
            <TexturePicker
                value={properties.texture ?? DEFAULT_TEXTURE}
                onChange={value => update({ texture: value })}
                basePath={basePath}
            />
        </div>
        <Vector3Field
            name="roomSize"
            label="Room Size"
            values={properties}
            onChange={update}
            fallback={[1, 1, 2.5]}
        />
        <ColorField
            name="color"
            label="Tint"
            values={properties}
            onChange={update}
            fallback="#ffffff"
        />
    </FieldGroup>;
}

export default InteriorMapEditor;
