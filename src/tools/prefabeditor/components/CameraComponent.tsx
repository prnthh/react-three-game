import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useNode } from '../SceneContext';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { FieldGroup, NumberField, SelectField } from './Input';

const CAMERA_PROJECTION_OPTIONS = [
    { value: 'perspective', label: 'Perspective' },
    { value: 'orthographic', label: 'Orthographic' },
] as const;

const cameraDefaults = {
    projection: 'perspective' as CameraProjection,
    fov: 50,
    near: 0.1,
    zoom: 1,
    far: 1000,
    orthographicSize: 10,
};

type CameraProjection = typeof CAMERA_PROJECTION_OPTIONS[number]['value'];
type CameraProperties = {
    projection?: CameraProjection;
    fov?: number;
    near?: number;
    zoom?: number;
    far?: number;
    orthographicSize?: number;
};

function CameraComponentEditor({ properties, update }: ComponentEditorProps<CameraProperties>) {
    const values = { ...cameraDefaults, ...properties };
    const projection = values.projection ?? cameraDefaults.projection;

    return (
        <FieldGroup>
            <SelectField
                name="projection"
                label="Projection"
                values={values}
                onChange={update}
                fallback={cameraDefaults.projection}
                options={[...CAMERA_PROJECTION_OPTIONS]}
            />
            {projection === 'perspective' ? (
                <NumberField
                    name="fov"
                    label="FOV"
                    values={values}
                    onChange={update}
                    fallback={50}
                    min={1}
                    max={179}
                    step={1}
                />
            ) : null}
            {projection === 'orthographic' ? (
                <NumberField
                    name="orthographicSize"
                    label="Ortho Size"
                    values={values}
                    onChange={update}
                    fallback={cameraDefaults.orthographicSize}
                    min={0.01}
                    step={0.1}
                />
            ) : null}
            <NumberField
                name="near"
                label="Near"
                values={values}
                onChange={update}
                fallback={0.1}
                min={0.001}
                step={0.1}
            />
            <NumberField
                name="zoom"
                label="Zoom"
                values={values}
                onChange={update}
                fallback={1}
                min={0.01}
                step={0.1}
            />
            <NumberField
                name="far"
                label="Far"
                values={values}
                onChange={update}
                fallback={1000}
                min={0.1}
                step={1}
            />
        </FieldGroup>
    );
}

function CameraComponentView({ properties, children }: ComponentViewProps<CameraProperties>) {
    const { editMode } = useNode();
    const { size } = useThree();
    const merged = { ...cameraDefaults, ...properties };
    const projection = merged.projection ?? cameraDefaults.projection;
    const fov = merged.fov;
    const near = merged.near;
    const zoom = merged.zoom;
    const far = merged.far;
    const orthographicSize = merged.orthographicSize;
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const halfHeight = orthographicSize / 2;
    const halfWidth = halfHeight * aspect;
    if (editMode) return (
        <group>
            <mesh>
                <boxGeometry args={[0.3, 0.3, 0.5]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
            <mesh position={[0, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.08, 0.16, 16]} />
                <meshBasicMaterial color={'#22d3ee'} wireframe />
            </mesh>
            {children}
        </group>
    );

    if (projection === 'orthographic') {
        return (
            <OrthographicCamera
                makeDefault
                near={near}
                zoom={zoom}
                far={far}
                left={-halfWidth}
                right={halfWidth}
                top={halfHeight}
                bottom={-halfHeight}
            >
                {children}
            </OrthographicCamera>
        );
    }

    return (
        <PerspectiveCamera
            makeDefault
            fov={fov}
            near={near}
            zoom={zoom}
            far={far}
        >
            {children}
        </PerspectiveCamera>
    );
}

const CameraComponent: Component<CameraProperties> = {
    name: 'Camera',
    Editor: CameraComponentEditor,
    View: CameraComponentView,
    defaultProperties: cameraDefaults,
};

export default CameraComponent;
