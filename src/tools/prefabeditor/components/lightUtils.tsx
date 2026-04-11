import { useState, type ReactNode } from 'react';
import { colors } from '../styles';
import { FieldGroup, FieldRow, NumberInput } from './Input';

export function mergeWithDefaults<T extends Record<string, any>>(
    defaults: T,
    properties?: Record<string, any> | null,
): T {
    const merged = { ...defaults };

    if (!properties) {
        return merged;
    }

    for (const [key, value] of Object.entries(properties)) {
        if (value !== undefined) {
            (merged as Record<string, any>)[key] = value;
        }
    }

    return merged;
}

export function LightSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '8px 10px',
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                background: colors.bgSurface,
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

export function ShadowBiasField({
    name,
    label,
    values,
    onChange,
    fallback = 0,
}: {
    name: string;
    label: string;
    values: Record<string, any>;
    onChange: (values: Record<string, any>) => void;
    fallback?: number;
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
                    min={-0.1}
                    max={0.1}
                    style={{ width: 92 }}
                />
                <select
                    value={step.toString()}
                    onChange={event => setStep(Number(event.target.value))}
                    style={{
                        width: 78,
                        backgroundColor: colors.bgInput,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                        borderRadius: 3,
                        fontSize: 11,
                        padding: '3px 6px',
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