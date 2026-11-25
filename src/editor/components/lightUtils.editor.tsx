import { useState, type ReactNode } from 'react';
import { base, colors, ui } from '../ui/styles.js';
import { BooleanField, FieldGroup, FieldRow, NumberField, NumberInput } from '../ui/Input.js';

import { localLightProperties, type shadowDefaults } from '../../runtime/components/lightUtils.js';

export function LightSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div
            style={{
                ...ui.secondaryPanel,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 6,
            }}
        >
            <div
                style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: colors.textMuted,
                    fontWeight: 600,
                }}
            >
                {title}
            </div>
            <FieldGroup>{children}</FieldGroup>
        </div>
    );
}

const shadowBiasSteps = [0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001] as const;

function getBiasStep(value: number) {
    const absValue = Math.abs(value);

    if (absValue === 0) {
        return 0.001;
    }

    return shadowBiasSteps.find(step => absValue >= step) ?? shadowBiasSteps[shadowBiasSteps.length - 1];
}

function formatBiasStep(step: number) {
    return step.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
        useGrouping: false,
    });
}

type ShadowBiasValues = {
    shadowBias: number;
    shadowNormalBias: number;
};

export function ShadowBiasField({
    name,
    label,
    values,
    onChange,
    fallback = 0,
    min = -1,
    max = 1,
}: {
    name: keyof ShadowBiasValues;
    label: string;
    values: ShadowBiasValues;
    onChange: (values: Partial<ShadowBiasValues>) => void;
    fallback?: number;
    min?: number;
    max?: number;
}) {
    const value = values[name] ?? fallback;
    const [step, setStep] = useState<number>(() => getBiasStep(value));

    return (
        <FieldRow label={label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <NumberInput
                    value={value}
                    onChange={nextValue => onChange({ [name]: nextValue })}
                    step={step}
                    min={min}
                    max={max}
                    style={{ width: 92 }}
                />
                <select
                    value={step.toString()}
                    onChange={event => setStep(Number(event.target.value))}
                    style={{
                        ...base.input,
                        width: 78,
                        fontSize: 11,
                        fontFamily: 'monospace',
                    }}
                    title="Bias scrub step"
                >
                    {shadowBiasSteps.map(option => (
                        <option key={option} value={option}>
                            {formatBiasStep(option)}
                        </option>
                    ))}
                </select>
            </div>
        </FieldRow>
    );
}

type ShadowValues = typeof shadowDefaults;
export function ShadowSection({ values, update, updatePolicy, children }: {
    values: ShadowValues;
    update: (values: Partial<ShadowValues>) => void;
    updatePolicy?: ReactNode;
    children?: ReactNode;
}) {
    const fields = { values, onChange: update };
    function numberField(name: 'shadowMapSize' | 'shadowIntensity' | 'shadowRadius' | 'shadowCameraNear' | 'shadowCameraFar', label: string) {
        const { default: fallback, ...limits } = localLightProperties[name];
        return <NumberField name={name} label={label} {...fields} {...limits} fallback={fallback} commitOnBlur={name === 'shadowMapSize'} />;
    }
    return <LightSection title="Shadow">
        <BooleanField name="castShadow" label="Cast Shadow" {...fields} />
        {values.castShadow && <>
            {updatePolicy ?? <BooleanField name="shadowAutoUpdate" label="Update Every Frame" {...fields} fallback={true} />}
            {numberField('shadowMapSize', 'Map Size')}
            <ShadowBiasField name="shadowBias" label="Bias" {...fields} />
            <ShadowBiasField name="shadowNormalBias" label="Normal Bias" {...fields} />
            {numberField('shadowIntensity', 'Opacity')}
            {numberField('shadowRadius', 'Softness')}
            {numberField('shadowCameraNear', 'Near')}
            {numberField('shadowCameraFar', 'Far')}
            {children}
        </>}
    </LightSection>;
}
