import type { ComponentEditorProps } from "./ComponentRegistry";
import { ColorField, NumberField } from "./Input";
import { mergeWithDefaults } from "./lightUtils";
import { LightSection } from "./lightUtils.editor";
import { hemisphereLightDefaults, HemisphereLightProperties } from "./HemisphereLightComponent";

function HemisphereLightEditor({ properties, update }: ComponentEditorProps<HemisphereLightProperties>) {
    const values = mergeWithDefaults(hemisphereLightDefaults, properties);
    return <LightSection title="Light">
        <ColorField name="skyColor" label="Sky Color" values={values} onChange={update} />
        <ColorField name="groundColor" label="Ground Color" values={values} onChange={update} />
        <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
    </LightSection>;
}

export default HemisphereLightEditor;
