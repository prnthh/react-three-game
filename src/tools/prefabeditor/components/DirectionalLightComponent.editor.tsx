import type { ComponentEditorProps } from "./ComponentRegistry";
import { BooleanField, ColorField, NumberField, NumberInput, Vector3Input } from "./Input";
import { MAX_SHADOW_MAP_SIZE, MIN_SHADOW_MAP_SIZE, mergeWithDefaults } from "./lightUtils";
import { LightSection, ShadowBiasField, RefreshShadowsButton } from "./lightUtils.editor";
import { colors } from "../styles";
import { directionalLightDefaults, DirectionalLightValues, DirectionalLightProperties } from "./DirectionalLightComponent";

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

function DirectionalLightComponentEditor({ properties, update }: ComponentEditorProps<DirectionalLightProperties>) {
    const values = mergeWithDefaults(directionalLightDefaults, properties);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={update} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
                <Vector3Input
                    label="Target Offset"
                    value={values.targetOffset}
                    onChange={targetOffset => update({ targetOffset })}
                    snap={0.5}
                />
            </LightSection>
            <LightSection title="Shadow">
                <BooleanField name="castShadow" label="Cast Shadow" values={values} onChange={update} fallback={false} />
                {values.castShadow ? (
                    <>
                        <NumberField name="shadowCascades" label="Cascades (1 = off)" values={values} onChange={update} min={1} max={4} step={1} fallback={1} commitOnBlur />
                        {values.shadowCascades > 1 ? <>
                            <NumberField name="shadowDistance" label="Shadow Distance" values={values} onChange={update} min={1} step={1} fallback={100} />
                            <small>Cascaded shadows follow the camera and update every frame.</small>
                        </> : <>
                            <BooleanField name="shadowAutoUpdate" label="Update Every Frame" values={values} onChange={update} fallback={true} />
                            {!values.shadowAutoUpdate && <RefreshShadowsButton />}
                        </>}
                        <NumberField
                            name="shadowMapSize"
                            label="Map Size"
                            values={values}
                            onChange={update}
                            min={MIN_SHADOW_MAP_SIZE}
                            max={MAX_SHADOW_MAP_SIZE}
                            step={128}
                            fallback={512}
                            commitOnBlur
                        />
                        <ShadowBiasField name="shadowBias" label="Bias" values={values} onChange={update} fallback={0} />
                        <ShadowBiasField name="shadowNormalBias" label="Normal Bias" values={values} onChange={update} fallback={0} />
                        <NumberField name="shadowIntensity" label="Opacity" values={values} onChange={update} min={0} max={1} step={0.05} fallback={1} />
                        <NumberField name="shadowRadius" label="Softness" values={values} onChange={update} min={0} step={0.25} fallback={1} />
                        <NumberField name="shadowCameraNear" label="Near" values={values} onChange={update} min={0.001} step={0.1} fallback={0.5} />
                        <NumberField name="shadowCameraFar" label="Far" values={values} onChange={update} min={0.1} step={1} fallback={500} />
                        {values.shadowCascades <= 1 && <ShadowFrustumField values={values} onChange={update} />}
                    </>
                ) : null}
            </LightSection>
        </div>
    );
}

export default DirectionalLightComponentEditor;
