import type { ComponentEditorProps } from "../../core/ComponentRegistry.js";
import { ColorField, NumberField } from "../ui/Input.js";
import { mergeWithDefaults } from "../../runtime/components/lightUtils.js";
import { LightSection } from "./lightUtils.editor.js";
import { hemisphereLightDefaults, HemisphereLightProperties } from "../../runtime/components/HemisphereLightComponent.js";

function HemisphereLightEditor({ properties, update }: ComponentEditorProps<HemisphereLightProperties>) {
    const values = mergeWithDefaults(hemisphereLightDefaults, properties);
    return <LightSection title="Light">
        <ColorField name="skyColor" label="Sky Color" values={values} onChange={update} />
        <ColorField name="groundColor" label="Ground Color" values={values} onChange={update} />
        <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
    </LightSection>;
}

export default HemisphereLightEditor;
