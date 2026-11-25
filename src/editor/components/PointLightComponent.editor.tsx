import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { ColorField, NumberField } from '../ui/Input.js';
import { LightSection, ShadowSection } from "./lightUtils.editor.js";
import { PointLightProperties } from "../../runtime/components/PointLightComponent.js";

function PointLightComponentEditor({ properties: values, update }: ComponentEditorProps<PointLightProperties>) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={update} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
                <NumberField name="distance" label="Distance" values={values} onChange={update} min={0} step={1} fallback={0} />
                <NumberField name="decay" label="Decay" values={values} onChange={update} min={0} step={0.1} fallback={2} />
            </LightSection>
            <ShadowSection values={values} update={update} />
        </div>
    );
}

export default PointLightComponentEditor;
