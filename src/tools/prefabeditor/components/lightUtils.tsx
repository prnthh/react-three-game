import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DoubleSide } from 'three';
import { base, colors, ui } from '../styles';
import { FieldGroup, FieldRow, NumberInput } from './Input';

export const MIN_SHADOW_MAP_SIZE = 64;
export const MAX_SHADOW_MAP_SIZE = 2048;

/** A small, raycastable Unity-style scene gizmo for otherwise invisible lights. */
export function EditorLightGizmo({
    color,
    selected = false,
}: {
    color: string;
    selected?: boolean;
}) {
    return (
        <mesh
            position={[0, -0.22, 0]}
            renderOrder={10_000}
        >
            <coneGeometry args={[0.36, 0.72, 12, 1, true]} />
            <meshBasicMaterial
                color={selected ? '#ffffff' : color}
                depthTest={false}
                depthWrite={false}
                opacity={selected ? 0.95 : 0.62}
                side={DoubleSide}
                toneMapped={false}
                transparent
                wireframe
            />
        </mesh>
    );
}

export function normalizeShadowMapSize(value: unknown, fallback = 512) {
    const numericValue = Number(value);
    const finiteValue = Number.isFinite(numericValue) ? numericValue : fallback;
    const clampedValue = Math.min(MAX_SHADOW_MAP_SIZE, Math.max(MIN_SHADOW_MAP_SIZE, finiteValue));
    return Math.round(clampedValue / 128) * 128;
}

interface ShadowMapOwner {
    shadow: {
        map: { dispose(): void } | null;
        mapPass?: { dispose(): void } | null;
        mapSize: { set(width: number, height: number): unknown };
        needsUpdate: boolean;
    };
}

/** Recreate an expensive shadow target only after an authored value is committed. */
export function useShadowMapResolution<T extends ShadowMapOwner>(
    lightRef: RefObject<T | null>,
    mapSize: number,
) {
    const appliedSize = useRef<number | null>(null);

    useLayoutEffect(() => {
        const shadow = lightRef.current?.shadow;
        if (!shadow || appliedSize.current === mapSize) return;

        const replacingTarget = appliedSize.current !== null;
        appliedSize.current = mapSize;
        shadow.mapSize.set(mapSize, mapSize);

        if (replacingTarget) {
            shadow.map?.dispose();
            shadow.map = null;
            shadow.mapPass?.dispose();
            shadow.mapPass = null;
        }

        shadow.needsUpdate = true;
    }, [lightRef, mapSize]);
}

export function mergeWithDefaults<T extends Record<string, any>>(
    defaults: T,
    properties?: Partial<NoInfer<T>> | null,
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
