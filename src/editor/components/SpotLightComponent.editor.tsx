import type { ComponentEditorProps } from "../../core/ComponentRegistry.js";
import { ColorField, Label, NumberField, Vector3Input } from "../ui/Input.js";
import { useEditorRef } from "../EditorContext.js";
import { TexturePicker } from "../assets/AssetBrowser.js";
import { LightSection, ShadowSection } from "./lightUtils.editor.js";
import { SpotLightProperties } from "../../runtime/components/SpotLightComponent.js";

function SpotLightComponentEditor({ properties: values, update }: ComponentEditorProps<SpotLightProperties>) {
    const { basePath } = useEditorRef();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={update} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
                <NumberField name="angle" label="Angle" values={values} onChange={update} min={0} max={Math.PI / 2} step={0.05} fallback={Math.PI / 3} />
                <NumberField name="penumbra" label="Penumbra" values={values} onChange={update} min={0} max={1} step={0.05} fallback={0} />
                <NumberField name="distance" label="Distance" values={values} onChange={update} min={0} step={1} fallback={0} />
                <NumberField name="decay" label="Decay" values={values} onChange={update} min={0} step={0.1} fallback={2} />
                <Vector3Input
                    label="Target Offset"
                    value={values.targetOffset}
                    onChange={targetOffset => update({ targetOffset })}
                    snap={0.5}
                />
                <div>
                    <Label>Texture Map</Label>
                    <TexturePicker
                        value={values.map}
                        onChange={(map) => update({ map })}
                        basePath={basePath}
                    />
                </div>
            </LightSection>
            <ShadowSection values={values} update={update} />
        </div>
    );
}

export default SpotLightComponentEditor;
