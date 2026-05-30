import { Environment } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, MutableRefObject } from "react";
import { AudioListener, BufferGeometry, ClampToEdgeWrapping, DoubleSide, LinearFilter, LinearMipmapLinearFilter, Mesh, NoColorSpace, PositionalAudio as ThreePositionalAudio, RepeatWrapping, SRGBColorSpace } from "three";
import { Text } from "three-text/three/react";
import type { MinificationTextureFilter, Texture } from "three";
import { assetRef, assetRefs, getComponentDef, registerComponent, type Component, type ComponentViewProps } from "./ComponentRegistry";
import { useAssetRuntime, useNode } from "../assetRuntime";
import { gameEvents, type ClickEventPayload, type ContactEventPayload } from "../GameEvents";
import { withBasePath } from "../runtimeUtils";
import type { Prefab } from "../types";

const PrefabRoot = lazy(() => import("../PrefabRoot"));
const RuntimeText = Text as unknown as ComponentType<Record<string, unknown>>;

function GeometryView({ properties }: ComponentViewProps) {
    const { geometryType } = properties;
    const args = Array.isArray(properties.args) ? properties.args : [];
    const geometryKey = `${geometryType ?? "box"}:${JSON.stringify(args)}`;

    switch (geometryType) {
        case "sphere":
            return <sphereGeometry key={geometryKey} args={args as [number, number?, number?]} />;
        case "plane":
            return <planeGeometry key={geometryKey} args={args as [number, number]} />;
        case "cylinder":
            return <cylinderGeometry key={geometryKey} args={args as [number, number, number, number?]} />;
        case "box":
        default:
            return <boxGeometry key={geometryKey} args={(args.length ? args : [1, 1, 1]) as [number, number, number]} />;
    }
}

const DEFAULT_TRIANGLE_POSITIONS = [0, 0, 0, 1, 0, 0, 0, 1, 0];
const DEFAULT_TRIANGLE_INDICES = [0, 1, 2];
const DEFAULT_TRIANGLE_UVS = [0, 0, 1, 0, 0, 1];

function numberArray(value: unknown, fallback: number[]) {
    return Array.isArray(value) && value.every(entry => typeof entry === "number" && Number.isFinite(entry))
        ? value
        : fallback;
}

function indexArray(indices: number[]) {
    if (indices.length === 0) return null;
    return Math.max(...indices) > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
}

function BufferGeometryView({ properties }: ComponentViewProps) {
    const positions = numberArray(properties.positions, DEFAULT_TRIANGLE_POSITIONS);
    const indices = numberArray(properties.indices, DEFAULT_TRIANGLE_INDICES);
    const normals = numberArray(properties.normals, []);
    const uvs = numberArray(properties.uvs, DEFAULT_TRIANGLE_UVS);
    const hasNormals = normals.length === positions.length;
    const hasUvs = uvs.length >= (positions.length / 3) * 2;
    const indicesArray = indexArray(indices);

    return (
        <bufferGeometry
            onUpdate={(geometry: BufferGeometry) => {
                if (properties.computeVertexNormals !== false && !hasNormals) geometry.computeVertexNormals();
                geometry.computeBoundingBox();
                geometry.computeBoundingSphere();
            }}
        >
            <bufferAttribute attach="attributes-position" args={[new Float32Array(positions), 3]} />
            {indicesArray ? <bufferAttribute attach="index" args={[indicesArray, 1]} /> : null}
            {hasNormals ? <bufferAttribute attach="attributes-normal" args={[new Float32Array(normals), 3]} /> : null}
            {hasUvs ? <bufferAttribute attach="attributes-uv" args={[new Float32Array(uvs), 2]} /> : null}
        </bufferGeometry>
    );
}

function ModelView({ properties, children }: ComponentViewProps<{ filename?: string; instanced?: boolean }>) {
    const { getModel } = useAssetRuntime();
    const sourceModel = properties.filename ? getModel(properties.filename) : null;
    const clonedModel = useMemo(() => {
        if (!sourceModel || !properties.filename || properties.instanced) return null;
        const clone = sourceModel.clone();
        clone.traverse((object) => {
            if (object instanceof Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        return clone;
    }, [properties.filename, properties.instanced, sourceModel]);

    return clonedModel ? <primitive object={clonedModel}>{children}</primitive> : <>{children}</>;
}

function configureTexture(texture: Texture | null | undefined, properties: Record<string, unknown>, colorSpace: Texture["colorSpace"]) {
    if (!texture) return;
    const repeat = Boolean(properties.repeat);
    const repeatCount = Array.isArray(properties.repeatCount) ? properties.repeatCount : [1, 1];
    const offset = Array.isArray(properties.offset) ? properties.offset : [0, 0];
    texture.wrapS = texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
    texture.repeat.set(Number(repeatCount[0] ?? 1), Number(repeatCount[1] ?? 1));
    texture.offset.set(Number(offset[0] ?? 0), Number(offset[1] ?? 0));
    texture.colorSpace = colorSpace;
    texture.generateMipmaps = properties.generateMipmaps !== false;
    texture.minFilter = (properties.minFilter === "LinearFilter" ? LinearFilter : LinearMipmapLinearFilter) as MinificationTextureFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
}

function useConfiguredTexture(path: unknown, properties: Record<string, unknown>, colorSpace: Texture["colorSpace"]) {
    const { getTexture } = useAssetRuntime();
    const sourceTexture = typeof path === "string" ? getTexture(path) : null;
    const texture = useMemo(() => sourceTexture?.clone(), [sourceTexture]);

    useEffect(() => {
        configureTexture(texture, properties, colorSpace);
    }, [properties, texture, colorSpace]);

    return texture ?? null;
}

function MaterialView({ properties }: ComponentViewProps) {
    const materialType = properties.materialType ?? "standard";
    const colorMap = useConfiguredTexture(properties.texture, properties, SRGBColorSpace);
    const normalMap = useConfiguredTexture(properties.normalMapTexture, properties, NoColorSpace);
    const offsetSpeed = Array.isArray(properties.offsetSpeed) ? properties.offsetSpeed : [0, 0];
    const animateOffset = Boolean(properties.animateOffset);

    useFrame((_state, delta) => {
        if (!animateOffset) return;
        for (const texture of [colorMap, normalMap]) {
            if (!texture) continue;
            texture.offset.x += Number(offsetSpeed[0] ?? 0) * delta;
            texture.offset.y += Number(offsetSpeed[1] ?? 0) * delta;
        }
    });

    const sharedProps = {
        attach: (properties.attach as string | undefined) ?? "material",
        color: (properties.color as string | undefined) ?? "#ffffff",
        opacity: (properties.opacity as number | undefined) ?? 1,
        transparent: Boolean(properties.transparent),
        wireframe: Boolean(properties.wireframe),
        toneMapped: properties.toneMapped !== false,
        side: DoubleSide,
        map: colorMap,
    };

    if (materialType === "basic") return <meshBasicMaterial {...sharedProps} />;
    if (materialType === "sprite") {
        return (
            <spriteMaterial
                {...sharedProps}
                rotation={(properties.rotation as number | undefined) ?? 0}
                sizeAttenuation={properties.sizeAttenuation !== false}
                depthTest={properties.depthTest !== false}
                depthWrite={Boolean(properties.depthWrite)}
            />
        );
    }

    const normalScale = Array.isArray(properties.normalScale) ? properties.normalScale : [1, 1];
    return (
        <meshStandardMaterial
            {...sharedProps}
            metalness={(properties.metalness as number | undefined) ?? 0}
            roughness={(properties.roughness as number | undefined) ?? 1}
            normalMap={normalMap}
            normalScale={normalMap ? [Number(normalScale[0] ?? 1), Number(normalScale[1] ?? 1)] : undefined}
        />
    );
}

function TextView({ properties, children, basePath = "" }: ComponentViewProps) {
    const { text = "", font, size, depth, width, align, color } = properties;
    const textContent = String(text || "");
    const resolvedFont = typeof font === "string" ? withBasePath(basePath, font) : undefined;
    const [offset, setOffset] = useState<[number, number, number]>([0, 0, 0]);

    useEffect(() => {
        Text.setHarfBuzzPath(withBasePath(basePath, "/fonts/hb.wasm"));
    }, [basePath]);

    if (!textContent) return null;

    const textProps: Record<string, unknown> = {
        size: size as number | undefined,
        depth: depth as number | undefined,
        layout: { align: align as "left" | "center" | "right" | undefined, width: width as number | undefined },
        color: color as string | undefined,
        onLoad: (_geometry: BufferGeometry, info: any) => {
            const bounds = info?.planeBounds;
            if (!bounds) return;
            const x = align === "center" ? -(bounds.min.x + bounds.max.x) / 2 : align === "right" ? -bounds.max.x : -bounds.min.x;
            setOffset([x, -(bounds.min.y + bounds.max.y) / 2, 0]);
        },
    };
    if (resolvedFont) textProps.font = resolvedFont;

    return (
        <group position={offset}>
            <RuntimeText {...textProps}>{textContent}</RuntimeText>
            {children}
        </group>
    );
}

function merge<T extends Record<string, unknown>>(defaults: T, properties: Record<string, unknown>) {
    return { ...defaults, ...properties };
}

function AmbientLightView({ properties, children }: ComponentViewProps) {
    const props = merge({ color: "#ffffff", intensity: 1 }, properties);
    return <><ambientLight color={props.color as string} intensity={props.intensity as number} />{children}</>;
}

function PointLightView({ properties, children }: ComponentViewProps) {
    const props = merge({ color: "#ffffff", intensity: 1, distance: 0, decay: 2 }, properties);
    return (
        <pointLight color={props.color as string} intensity={props.intensity as number} distance={props.distance as number} decay={props.decay as number}>
            {children}
        </pointLight>
    );
}

function DirectionalLightView({ properties, children }: ComponentViewProps) {
    const props = merge({ color: "#ffffff", intensity: 1, castShadow: false }, properties);
    return <directionalLight color={props.color as string} intensity={props.intensity as number} castShadow={Boolean(props.castShadow)}>{children}</directionalLight>;
}

function SpotLightView({ properties, children }: ComponentViewProps) {
    const props = merge({ color: "#ffffff", intensity: 1, angle: Math.PI / 3, penumbra: 0, distance: 0, decay: 2, castShadow: false }, properties);
    return (
        <spotLight
            color={props.color as string}
            intensity={props.intensity as number}
            angle={props.angle as number}
            penumbra={props.penumbra as number}
            distance={props.distance as number}
            decay={props.decay as number}
            castShadow={Boolean(props.castShadow)}
        >
            {children}
        </spotLight>
    );
}

function CameraView({ properties, children }: ComponentViewProps) {
    const projection = properties.projection ?? "perspective";
    if (projection === "orthographic") {
        return <orthographicCamera zoom={(properties.zoom as number | undefined) ?? 1}>{children}</orthographicCamera>;
    }
    return <perspectiveCamera fov={(properties.fov as number | undefined) ?? 50}>{children}</perspectiveCamera>;
}

function EnvironmentView({ properties, children }: ComponentViewProps) {
    const { getAssetRevision } = useAssetRuntime();
    const intensity = (properties.intensity as number | undefined) ?? 1;
    const resolution = (properties.resolution as number | undefined) ?? 256;
    return (
        <Environment key={`${getAssetRevision()}::${intensity}::${resolution}`} background environmentIntensity={intensity} resolution={resolution} frames={1}>
            {children}
        </Environment>
    );
}

function PrefabRefView({ properties, children, basePath = "" }: ComponentViewProps<{ url?: string }>) {
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab | null>(null);
    const resolvedUrl = properties.url ? withBasePath(basePath, properties.url) : "";

    useEffect(() => {
        if (!resolvedUrl) return undefined;
        let cancelled = false;
        void fetch(resolvedUrl)
            .then(response => response.json())
            .then(data => {
                if (!cancelled) setLoadedPrefab(data as Prefab);
            })
            .catch(error => console.warn("[PrefabRef] Failed to load:", resolvedUrl, error));
        return () => {
            cancelled = true;
        };
    }, [resolvedUrl]);

    return (
        <>
            {loadedPrefab ? (
                <Suspense fallback={null}>
                    <PrefabRoot data={loadedPrefab} editMode={false} basePath={basePath} />
                </Suspense>
            ) : null}
            {children}
        </>
    );
}

type ClipMode = "single" | "random" | "sequence";

type SoundProperties = {
    clips?: string[];
    eventName?: string;
    autoplay?: boolean;
    loop?: boolean;
    clipMode?: ClipMode;
    positional?: boolean;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    distanceModel?: "linear" | "inverse" | "exponential";
    pitch?: number;
    randomizePitch?: boolean;
    minPitch?: number;
    maxPitch?: number;
    volume?: number;
    randomizeVolume?: boolean;
    minVolume?: number;
    maxVolume?: number;
};

let sharedAudioListener: AudioListener | null = null;

function getSharedAudioListener() {
    if (!sharedAudioListener) sharedAudioListener = new AudioListener();
    return sharedAudioListener;
}

function clampRange(min: number | undefined, max: number | undefined, fallbackMin: number, fallbackMax: number) {
    const safeMin = Number.isFinite(min) ? Number(min) : fallbackMin;
    const safeMax = Number.isFinite(max) ? Number(max) : fallbackMax;
    return safeMin <= safeMax ? [safeMin, safeMax] as const : [safeMax, safeMin] as const;
}

function sampleRange(min: number, max: number) {
    return min + Math.random() * (max - min);
}

function getPitchValue(properties: SoundProperties) {
    if (properties.randomizePitch) {
        const [pitchFloor, pitchCeiling] = clampRange(properties.minPitch, properties.maxPitch, 0.96, 1.04);
        return sampleRange(pitchFloor, pitchCeiling);
    }
    return Number.isFinite(properties.pitch) ? Number(properties.pitch) : 1;
}

function getVolumeValue(properties: SoundProperties) {
    if (properties.randomizeVolume) {
        const [volumeFloor, volumeCeiling] = clampRange(properties.minVolume, properties.maxVolume, 0.9, 1);
        return sampleRange(volumeFloor, volumeCeiling);
    }
    return Number.isFinite(properties.volume) ? Number(properties.volume) : 1;
}

function resolveClipPaths({ clips, clipMode }: SoundProperties) {
    const paths = (clips ?? []).map(clip => clip.trim()).filter(Boolean);
    return { paths, mode: paths.length > 0 ? clipMode ?? "random" : "single" as ClipMode };
}

function pickClip(paths: string[], mode: ClipMode, sequenceIndexRef: MutableRefObject<number>) {
    if (paths.length <= 1 || mode === "single") return paths[0];
    if (mode === "sequence") {
        const clip = paths[sequenceIndexRef.current % paths.length];
        sequenceIndexRef.current += 1;
        return clip;
    }
    return paths[Math.floor(Math.random() * paths.length)];
}

function payloadMatchesNode(nodeId: string | undefined, payload: unknown) {
    if (!nodeId || !payload || typeof payload !== "object") return true;

    const eventPayload = payload as ClickEventPayload & ContactEventPayload;
    const relatedNodeIds = [
        eventPayload.nodeId,
        eventPayload.sourceEntityId,
        eventPayload.sourceNodeId,
        eventPayload.targetEntityId,
        eventPayload.targetNodeId,
        eventPayload.instanceEntityId,
    ].filter((value): value is string => typeof value === "string");

    return relatedNodeIds.length > 0 ? relatedNodeIds.includes(nodeId) : true;
}

function playBufferedAudio(audio: ThreePositionalAudio, buffer: AudioBuffer, properties: SoundProperties) {
    void audio.listener.context.resume();
    if (audio.isPlaying) audio.stop();
    audio.setBuffer(buffer);
    audio.setLoop(Boolean(properties.loop));
    audio.setPlaybackRate(getPitchValue(properties));
    audio.setVolume(getVolumeValue(properties));
    audio.play();
}

function SoundView({ properties, children }: ComponentViewProps<SoundProperties>) {
    const { getSound } = useAssetRuntime();
    const { editMode, nodeId } = useNode();
    const { camera } = useThree();
    const { eventName, autoplay = false, positional = false, refDistance = 1, maxDistance = 24, rolloffFactor = 1, distanceModel = "inverse" } = properties;
    const sequenceIndexRef = useRef(0);
    const listenerRef = useRef<AudioListener | null>(null);
    const positionalAudioRef = useRef<ThreePositionalAudio | null>(null);
    const { paths, mode } = resolveClipPaths(properties);

    if (!listenerRef.current) listenerRef.current = getSharedAudioListener();

    useEffect(() => {
        const listener = listenerRef.current;
        if (!listener) return;

        if (listener.parent !== camera) {
            listener.parent?.remove(listener);
            camera.add(listener);
        }

        return () => {
            if (listener.parent === camera) camera.remove(listener);
        };
    }, [camera]);

    useEffect(() => {
        const audio = positionalAudioRef.current;
        if (!audio) return;

        audio.setRefDistance(positional ? refDistance : Math.max(refDistance, 1));
        audio.setMaxDistance(positional ? maxDistance : 1_000_000);
        audio.setRolloffFactor(positional ? rolloffFactor : 0);
        audio.setDistanceModel(positional ? distanceModel : "inverse");
    }, [distanceModel, maxDistance, positional, refDistance, rolloffFactor]);

    useEffect(() => {
        if (editMode || paths.length === 0 || !eventName) return;

        return gameEvents.on(eventName, (payload) => {
            if (!payloadMatchesNode(nodeId, payload)) return;

            const clip = pickClip(paths, mode, sequenceIndexRef);
            const audio = positionalAudioRef.current;
            const buffer = clip ? getSound(clip) : null;
            if (audio && buffer) playBufferedAudio(audio, buffer, properties);
        });
    }, [editMode, eventName, getSound, mode, nodeId, paths, properties]);

    useEffect(() => {
        if (editMode || !autoplay || paths.length === 0) return;

        const clip = pickClip(paths, mode, sequenceIndexRef);
        const audio = positionalAudioRef.current;
        const buffer = clip ? getSound(clip) : null;
        if (audio && buffer) playBufferedAudio(audio, buffer, properties);

        return () => {
            if (audio?.isPlaying) audio.stop();
        };
    }, [autoplay, editMode, getSound, mode, paths, properties]);

    return (
        <>
            {listenerRef.current ? <positionalAudio ref={positionalAudioRef} args={[listenerRef.current]} /> : null}
            {children}
        </>
    );
}

const runtimeComponents: Component[] = [
    { name: "Transform", disableSiblingComposition: true, defaultProperties: {} },
    { name: "Geometry", disableSiblingComposition: "geometry", View: GeometryView, defaultProperties: { geometryType: "box", args: [1, 1, 1], emitClickEvent: false, clickEventName: "" } },
    { name: "BufferGeometry", disableSiblingComposition: "geometry", View: BufferGeometryView, defaultProperties: { positions: DEFAULT_TRIANGLE_POSITIONS, indices: DEFAULT_TRIANGLE_INDICES, normals: [], uvs: DEFAULT_TRIANGLE_UVS, groups: [], computeVertexNormals: true, emitClickEvent: false, clickEventName: "" } },
    { name: "Model", View: ModelView, defaultProperties: {}, getAssetRefs: properties => assetRefs(assetRef("model", properties.filename)) },
    { name: "Sprite", disableSiblingComposition: true, defaultProperties: { center: [0.5, 0.5], emitClickEvent: false, clickEventName: "node:click" } },
    { name: "Text", View: TextView, defaultProperties: { text: "Hello World", color: "#ffffff", size: 1, depth: 0.05, align: "center" } },
    { name: "Material", View: MaterialView, defaultProperties: { attach: "material", materialType: "standard", color: "#ffffff", toneMapped: true, wireframe: false, transparent: false, opacity: 1, sizeAttenuation: true, offset: [0, 0], animateOffset: false, offsetSpeed: [0, 0], metalness: 0, roughness: 1 }, getAssetRefs: properties => assetRefs(assetRef("texture", properties.texture), assetRef("texture", properties.normalMapTexture)) },
    { name: "SpotLight", View: SpotLightView, defaultProperties: {}, getAssetRefs: properties => assetRefs(assetRef("texture", properties.map)) },
    { name: "PointLight", View: PointLightView, defaultProperties: {} },
    { name: "DirectionalLight", View: DirectionalLightView, defaultProperties: {} },
    { name: "AmbientLight", View: AmbientLightView, defaultProperties: {} },
    { name: "Environment", disableSiblingComposition: true, View: EnvironmentView, defaultProperties: {} },
    { name: "Camera", disableSiblingComposition: true, View: CameraView, defaultProperties: { projection: "perspective", fov: 50, near: 0.1, zoom: 1, far: 1000 } },
    { name: "Sound", View: SoundView, defaultProperties: { eventName: "", autoplay: false, loop: false, clips: [], clipMode: "single", positional: false, refDistance: 1, maxDistance: 24, rolloffFactor: 1, distanceModel: "inverse", pitch: 1, randomizePitch: false, minPitch: 0.96, maxPitch: 1.04, volume: 1, randomizeVolume: false, minVolume: 0.9, maxVolume: 1 }, getAssetRefs: (properties) => Array.isArray(properties.clips) ? properties.clips.filter((clip): clip is string => typeof clip === "string").map(path => ({ type: "sound", path })) : [] },
    { name: "Data", defaultProperties: { values: {} } },
    { name: "PrefabRef", View: PrefabRefView, defaultProperties: { url: "" } },
];

let didRegisterRuntimeComponents = false;

export function registerRuntimeComponents() {
    if (didRegisterRuntimeComponents) return;
    runtimeComponents.forEach(component => {
        if (!getComponentDef(component.name)) registerComponent(component);
    });
    didRegisterRuntimeComponents = true;
}

export { runtimeComponents };
