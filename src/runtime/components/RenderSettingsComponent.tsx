import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AgXToneMapping, ACESFilmicToneMapping, BasicShadowMap, CineonToneMapping, LinearToneMapping, NeutralToneMapping, NoToneMapping, PCFShadowMap, ReinhardToneMapping, SRGBColorSpace, LinearSRGBColorSpace, type ToneMapping, type ShadowMapType } from 'three';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

const toneMappings = { none: NoToneMapping, linear: LinearToneMapping, reinhard: ReinhardToneMapping, cineon: CineonToneMapping, aces: ACESFilmicToneMapping, agx: AgXToneMapping, neutral: NeutralToneMapping };
const shadowTypes = { basic: BasicShadowMap, pcf: PCFShadowMap };
export interface RenderSettingsProperties {
    toneMapping?: keyof typeof toneMappings;
    exposure?: number;
    outputColorSpace?: 'srgb' | 'linear-srgb';
    shadows?: boolean;
    shadowMapType?: keyof typeof shadowTypes;
}
type Renderer = { toneMapping: ToneMapping; toneMappingExposure: number; outputColorSpace: string; shadowMap: { enabled: boolean; type: ShadowMapType } };
function override<T extends object>(target: T, values: Partial<T>) {
    const entries = Object.entries(values).filter(([, value]) => value !== undefined);
    const previous = Object.fromEntries(entries.map(([key]) => [key, target[key as keyof T]]));
    return {
        apply: () => { for (const [key, value] of entries) if (Reflect.get(target, key) !== value) Reflect.set(target, key, value); },
        restore: () => { Object.assign(target, previous); },
    };
}
/** Only authored fields override the renderer. Removal restores exactly those fields. */
export function applyRendererSettings(renderer: Renderer, p: RenderSettingsProperties) {
    const values = override(renderer, {
        toneMapping: p.toneMapping === undefined ? undefined : toneMappings[p.toneMapping],
        toneMappingExposure: p.exposure === undefined ? undefined : Math.max(0, p.exposure),
        outputColorSpace: p.outputColorSpace === undefined ? undefined : p.outputColorSpace === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace,
    });
    const shadows = override(renderer.shadowMap, { enabled: p.shadows, type: p.shadowMapType === undefined ? undefined : shadowTypes[p.shadowMapType] });
    const settings = { apply: () => { values.apply(); shadows.apply(); }, restore: () => { shadows.restore(); values.restore(); } };
    settings.apply();
    return settings;
}
function RenderSettingsView({ properties: p, children }: ComponentViewProps<RenderSettingsProperties>) {
    const renderer = useThree(state => state.gl);
    const current = useRef<ReturnType<typeof applyRendererSettings> | null>(null);
    useLayoutEffect(() => {
        const settings = applyRendererSettings(renderer, p);
        current.current = settings;
        return () => { current.current = null; settings.restore(); };
    }, [renderer, p.toneMapping, p.exposure, p.outputColorSpace, p.shadows, p.shadowMapType]);
    // R3F reapplies canvas defaults on resize and parent renders. Reassert authored
    // fields before environment captures and rendering; omitted fields stay untouched.
    useFrame(() => current.current?.apply(), -1000);
    return children;
}
const RenderSettingsComponent: Component<RenderSettingsProperties> = {
    name: 'RenderSettings', scope: 'scene', exclusive: 'render-settings', category: 'lighting', View: RenderSettingsView,
    description: 'Scene-root renderer overrides. Unspecified fields keep the renderer defaults. Applies in Edit and Play; removal restores the overridden values. Effects are authored separately with PostProcessing.',
    properties: {
        toneMapping: { type: 'select', default: undefined, options: Object.keys(toneMappings).map(value => ({ value: value as NonNullable<RenderSettingsProperties['toneMapping']>, label: value })) },
        exposure: { default: undefined, min: 0, max: 10, step: 0.05 },
        outputColorSpace: { type: 'select', default: undefined, options: [{ value: 'srgb', label: 'sRGB' }, { value: 'linear-srgb', label: 'Linear sRGB' }] },
        shadows: { type: 'boolean', default: undefined },
        shadowMapType: { type: 'select', default: undefined, options: [{ value: 'basic', label: 'Basic' }, { value: 'pcf', label: 'PCF' }] },
    },
};
export default RenderSettingsComponent;
