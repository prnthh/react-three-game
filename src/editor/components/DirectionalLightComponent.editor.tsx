import type { ComponentEditorProps } from "../../core/ComponentRegistry.js";
import { BooleanField, ColorField, NumberField, NumberInput, Vector3Input } from "../ui/Input.js";
import { LightSection, ShadowSection } from "./lightUtils.editor.js";
import { colors } from "../ui/styles.js";
import { DirectionalLightValues, DirectionalLightProperties } from "../../runtime/components/DirectionalLightComponent.js";

function ShadowFrustumField({ values, onChange }: { values: DirectionalLightValues; onChange: (values: Partial<DirectionalLightValues>) => void }) {
    // Minimal, no lock UI for simplicity (can add back if needed)
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textMuted, textAlign: 'left' }}>Shadow Frustum</div>
            <div style={{ display: 'flex', gap: 8 }}>
                <NumberInput
                    value={values.shadowCameraTop}
                    onChange={v => onChange({ shadowCameraTop: v })}
                    step={0.5}
                    style={{ width: 62, minWidth: 62, textAlign: 'center' }}
                    label="Top"
                />
                <NumberInput
                    value={values.shadowCameraBottom}
                    onChange={v => onChange({ shadowCameraBottom: v })}
                    step={0.5}
                    style={{ width: 62, minWidth: 62, textAlign: 'center' }}
                    label="Bottom"
                />
                <NumberInput
                    value={values.shadowCameraLeft}
                    onChange={v => onChange({ shadowCameraLeft: v })}
                    step={0.5}
                    style={{ width: 62, minWidth: 62, textAlign: 'center' }}
                    label="Left"
                />
                <NumberInput
                    value={values.shadowCameraRight}
                    onChange={v => onChange({ shadowCameraRight: v })}
                    step={0.5}
                    style={{ width: 62, minWidth: 62, textAlign: 'center' }}
                    label="Right"
                />
            </div>
        </div>
    );
}

function DirectionalLightComponentEditor({ properties: values, update }: ComponentEditorProps<DirectionalLightProperties>) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={update} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
                <BooleanField name="followCamera" label="Follow camera" values={values} onChange={update} fallback={false} />
                {values.followCamera && <>
                    <NumberField name="followCameraStep" label="Step size (X/Z)" values={values} onChange={update} min={0.01} step={1} fallback={8} />
                    <NumberField name="followCameraInterval" label="Update interval (s)" values={values} onChange={update} min={0.01} step={0.05} fallback={0.25} />
                </>}
                <Vector3Input
                    label="Target Offset"
                    value={values.targetOffset}
                    onChange={targetOffset => update({ targetOffset })}
                    snap={0.5}
                />
            </LightSection>
            <ShadowSection values={values} update={update} updatePolicy={<>
                <NumberField name="shadowCascades" label="Cascades (1 = off)" values={values} onChange={update} min={1} max={4} step={1} fallback={1} commitOnBlur />
                {values.shadowCascades > 1 ? <>
                    <NumberField name="shadowDistance" label="Shadow Distance" values={values} onChange={update} min={1} step={1} fallback={100} />
                    <small>Cascaded shadows follow the camera and update every frame.</small>
                </> : <BooleanField name="shadowAutoUpdate" label="Update Every Frame" values={values} onChange={update} fallback={true} />}
            </>}>
                <NumberField name="shadowCameraLayers" label="Layer mask" values={values} onChange={update} min={0} step={1} fallback={1} />
                {values.shadowCascades <= 1 && <ShadowFrustumField values={values} onChange={update} />}
            </ShadowSection>
        </div>
    );
}

export default DirectionalLightComponentEditor;
