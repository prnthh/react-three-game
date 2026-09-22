import type { ComponentEditorProps } from './ComponentRegistry';
import { BooleanField, ColorField, NumberField } from './Input';
import { MAX_SHADOW_MAP_SIZE, MIN_SHADOW_MAP_SIZE, mergeWithDefaults } from "./lightUtils";
import { LightSection, ShadowBiasField, RefreshShadowsButton } from "./lightUtils.editor";
import { pointLightDefaults, PointLightProperties } from "./PointLightComponent";

function PointLightComponentEditor({ properties, update }: ComponentEditorProps<PointLightProperties>) {
    const values = mergeWithDefaults(pointLightDefaults, properties);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={update} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
                <NumberField name="distance" label="Distance" values={values} onChange={update} min={0} step={1} fallback={0} />
                <NumberField name="decay" label="Decay" values={values} onChange={update} min={0} step={0.1} fallback={2} />
            </LightSection>
            <LightSection title="Shadow">
                <BooleanField name="castShadow" label="Cast Shadow" values={values} onChange={update} fallback={false} />
                {values.castShadow ? (
                    <>
                        <BooleanField name="shadowAutoUpdate" label="Update Every Frame" values={values} onChange={update} fallback={true} />
                        {!values.shadowAutoUpdate && <RefreshShadowsButton />}
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
                    </>
                ) : null}
            </LightSection>
        </div>
    );
}

export default PointLightComponentEditor;
