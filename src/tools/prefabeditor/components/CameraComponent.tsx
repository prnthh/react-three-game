import { OrthographicCamera as DreiOrthographicCamera, PerspectiveCamera as DreiPerspectiveCamera, useHelper } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import {
    CameraHelper,
    MathUtils,
    type OrthographicCamera,
    type PerspectiveCamera,
} from 'three';
import { useNode } from '../SceneContext';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { FieldGroup, NumberField, SelectField } from './Input';
import { colors } from '../styles';

const CAMERA_PROJECTION_OPTIONS = [
    { value: 'perspective', label: 'Perspective' },
    { value: 'orthographic', label: 'Orthographic' },
] as const;

export const CAMERA_DEFAULTS = {
    projection: 'perspective' as CameraProjection,
    fov: 50,
    near: 0.1,
    zoom: 1,
    far: 1000,
    orthographicSize: 10,
    focus: 10,
    filmGauge: 35,
    filmOffset: 0,
} as const;

export type CameraProjection = typeof CAMERA_PROJECTION_OPTIONS[number]['value'];
export type CameraProperties = {
    projection?: CameraProjection;
    fov?: number;
    near?: number;
    zoom?: number;
    far?: number;
    orthographicSize?: number;
    focus?: number;
    filmGauge?: number;
    filmOffset?: number;
};

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

function CameraComponentView({ properties, children }: ComponentViewProps<CameraProperties>) {
    const { editMode, isSelected } = useNode();
    const { size } = useThree();
    const merged = { ...CAMERA_DEFAULTS, ...properties };
    const projection = merged.projection ?? CAMERA_DEFAULTS.projection;
    const fov = MathUtils.clamp(merged.fov, 1, 179);
    const near = Math.max(0.001, merged.near);
    const zoom = Math.max(0.01, merged.zoom);
    const far = Math.max(near + 0.001, merged.far);
    const orthographicSize = Math.max(0.01, merged.orthographicSize);
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const halfHeight = orthographicSize / 2;
    const halfWidth = halfHeight * aspect;
    const orthographicCameraRef = useRef<OrthographicCamera>(null!);
    const perspectiveCameraRef = useRef<PerspectiveCamera>(null!);
    const cameraRef = projection === 'orthographic' ? orthographicCameraRef : perspectiveCameraRef;

    useHelper(editMode && isSelected ? cameraRef : null, CameraHelper);

    const editorGizmo = editMode ? (
        <>
            <mesh>
                <boxGeometry args={[0.3, 0.3, 0.5]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
            <mesh position={[0, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.08, 0.16, 16]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
        </>
    ) : null;

    if (projection === 'orthographic') {
        return (
            <group>
                <DreiOrthographicCamera
                    ref={orthographicCameraRef}
                    makeDefault={!editMode}
                    near={near}
                    zoom={zoom}
                    far={far}
                    left={-halfWidth}
                    right={halfWidth}
                    top={halfHeight}
                    bottom={-halfHeight}
                >
                    {children}
                </DreiOrthographicCamera>
                {editorGizmo}
            </group>
        );
    }

    return (
        <group>
            <DreiPerspectiveCamera
                ref={perspectiveCameraRef}
                makeDefault={!editMode}
                fov={fov}
                near={near}
                zoom={zoom}
                far={far}
                focus={Math.max(0.001, merged.focus)}
                filmGauge={Math.max(0.01, merged.filmGauge)}
                filmOffset={merged.filmOffset}
            >
                {children}
            </DreiPerspectiveCamera>
            {editorGizmo}
        </group>
    );
}

const CameraComponent: Component<CameraProperties> = {
    name: 'Camera',
    Editor: CameraComponentEditor,
    View: CameraComponentView,
    properties: {
        projection: { type: 'select', default: CAMERA_DEFAULTS.projection, options: CAMERA_PROJECTION_OPTIONS },
        fov: { default: CAMERA_DEFAULTS.fov, min: 1, max: 179, step: 1 },
        near: { default: CAMERA_DEFAULTS.near, min: 0.001, step: 0.1 },
        zoom: { default: CAMERA_DEFAULTS.zoom, min: 0.01, step: 0.1 },
        far: { default: CAMERA_DEFAULTS.far, min: 0.1, step: 1 },
        orthographicSize: { default: CAMERA_DEFAULTS.orthographicSize, min: 0.01, step: 0.1 },
        focus: { default: CAMERA_DEFAULTS.focus, min: 0.001, step: 0.1 },
        filmGauge: { default: CAMERA_DEFAULTS.filmGauge, min: 0.01, step: 1 },
        filmOffset: { default: CAMERA_DEFAULTS.filmOffset, step: 0.1 },
    },
};

export default CameraComponent;
