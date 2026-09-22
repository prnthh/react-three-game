import { type ReactNode } from 'react';
import type { ComponentEditorProps } from './ComponentRegistry';
import { FieldGroup, NumberField, SelectField } from './Input';
import { colors } from '../styles';
import { CAMERA_PROJECTION_OPTIONS, CAMERA_DEFAULTS, CameraProperties } from "./CameraComponent";

function CameraSection({ title, children }: { title: string; children: ReactNode }) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: colors.textMuted, fontSize: 10, fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {title}
        </div>
        {children}
    </div>;
}

function CameraComponentEditor({ properties, update }: ComponentEditorProps<CameraProperties>) {
    const values = { ...CAMERA_DEFAULTS, ...properties };
    const projection = values.projection ?? CAMERA_DEFAULTS.projection;

    return (
        <FieldGroup>
            <CameraSection title="Lens">
                <SelectField
                    name="projection"
                    label="Projection"
                    values={values}
                    onChange={update}
                    fallback={CAMERA_DEFAULTS.projection}
                    options={[...CAMERA_PROJECTION_OPTIONS]}
                />
                {projection === 'perspective' ? <>
                    <NumberField name="fov" label="Vertical FOV" values={values} onChange={update} fallback={CAMERA_DEFAULTS.fov} min={1} max={179} step={1} />
                    <NumberField name="focus" label="Focus Distance" values={values} onChange={update} fallback={CAMERA_DEFAULTS.focus} min={0.001} step={0.1} />
                    <NumberField name="filmGauge" label="Film Gauge" values={values} onChange={update} fallback={CAMERA_DEFAULTS.filmGauge} min={0.01} step={1} />
                    <NumberField name="filmOffset" label="Lens Shift" values={values} onChange={update} fallback={CAMERA_DEFAULTS.filmOffset} step={0.1} />
                </> : null}
                {projection === 'orthographic' ? (
                <NumberField
                    name="orthographicSize"
                    label="Ortho Size"
                    values={values}
                    onChange={update}
                    fallback={CAMERA_DEFAULTS.orthographicSize}
                    min={0.01}
                    step={0.1}
                />
                ) : null}
                <NumberField name="zoom" label="Zoom" values={values} onChange={update} fallback={CAMERA_DEFAULTS.zoom} min={0.01} step={0.1} />
            </CameraSection>
            <CameraSection title="Clipping">
                <NumberField name="near" label="Near" values={values} onChange={update} fallback={CAMERA_DEFAULTS.near} min={0.001} step={0.1} />
                <NumberField name="far" label="Far" values={values} onChange={update} fallback={CAMERA_DEFAULTS.far} min={0.1} step={1} />
            </CameraSection>
        </FieldGroup>
    );
}

export default CameraComponentEditor;
