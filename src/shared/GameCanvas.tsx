import { Canvas, extend, CanvasProps, useThree } from "@react-three/fiber";
import { WebGPURenderer, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial, PCFShadowMap } from "three/webgpu";
import { Suspense, useLayoutEffect, type RefObject } from "react";
import { Group, type Object3D } from "three";
import { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.Nodes.js";
import { Loader } from "@react-three/drei";
import { installBVHRaycasting } from "./raycast";
import { AssetRuntimeProvider } from "../tools/prefabeditor/assetRuntime";
import { AudioRuntimeProvider } from "../tools/prefabeditor/AudioRuntime";

extend({
    MeshBasicNodeMaterial: MeshBasicNodeMaterial,
    MeshStandardNodeMaterial: MeshStandardNodeMaterial,
    SpriteNodeMaterial: SpriteNodeMaterial,
});

installBVHRaycasting();

export interface GameCanvasProps extends Omit<CanvasProps, 'children'> {
    loader?: boolean;
    children: React.ReactNode;
    glConfig?: WebGPURendererParameters;
}

type CompileQueue = {
    camera: Parameters<WebGPURenderer["compileAsync"]>[1];
    objects: Map<Object3D, boolean>;
    running: Promise<void> | null;
    scene: Parameters<WebGPURenderer["compileAsync"]>[2];
    scheduled: boolean;
};

const compileQueues = new WeakMap<object, CompileQueue>();
const preparedObjects = new WeakMap<Object3D, unknown>();

/** Batches newly attached render objects into one shader preparation pass. */
export function useCompileObject(ref: RefObject<Object3D | null>, revision?: unknown) {
    const gl = useThree(state => state.gl);
    const camera = useThree(state => state.camera);
    const scene = useThree(state => state.scene);

    useLayoutEffect(() => {
        const object = ref.current;
        if (!object || (preparedObjects.has(object) && preparedObjects.get(object) === revision)) return;
        const firstCompile = !preparedObjects.has(object);
        preparedObjects.set(object, revision);

        const renderer = gl as unknown as WebGPURenderer;
        let queue = compileQueues.get(renderer);
        if (!queue) {
            queue = { camera, objects: new Map(), running: null, scene, scheduled: false };
            compileQueues.set(renderer, queue);
        }
        queue.camera = camera;
        queue.scene = scene;
        queue.objects.set(object, firstCompile || queue.objects.get(object) === true);
        if (queue.scheduled) return;
        queue.scheduled = true;

        const flush = () => {
            if (queue!.running) {
                void queue!.running.then(() => queueMicrotask(flush));
                return;
            }
            queue!.scheduled = false;
            const entries = Array.from(queue!.objects);
            queue!.objects.clear();
            if (entries.length === 0) return;

            const queued = new Set(entries.map(([object]) => object));
            const roots = entries.filter(([object]) => {
                let parent = object.parent;
                while (parent) {
                    if (queued.has(parent)) return false;
                    parent = parent.parent;
                }
                return true;
            });
            const objects = roots.map(([object]) => object);

            const compileRoot = objects.length === 1 ? objects[0] : new Group();
            if (compileRoot instanceof Group && objects.length > 1) compileRoot.children.push(...objects);
            const visibility: Array<[Object3D, boolean, boolean]> = [];
            compileRoot.traverse(candidate => {
                visibility.push([candidate, candidate.visible, candidate.frustumCulled]);
                candidate.visible = true;
                candidate.frustumCulled = false;
            });

            let compilation: Promise<void> | undefined;
            try {
                compilation = renderer.compileAsync(compileRoot, queue!.camera, queue!.scene);
            } catch (error) {
                console.error("[GameCanvas] object prewarm failed:", error);
            } finally {
                for (let i = 0; i < visibility.length; i += 1) {
                    const [candidate, visible, frustumCulled] = visibility[i];
                    candidate.visible = visible;
                    candidate.frustumCulled = frustumCulled;
                }
            }
            if (compilation) {
                const pendingVisibility = roots.filter(([object, firstCompile]) => firstCompile && object.visible);
                for (let i = 0; i < pendingVisibility.length; i += 1) pendingVisibility[i][0].visible = false;
                const finish = () => {
                    for (let i = 0; i < pendingVisibility.length; i += 1) pendingVisibility[i][0].visible = true;
                    queue!.running = null;
                };
                queue!.running = compilation.then(
                    finish,
                    error => {
                        finish();
                        console.error("[GameCanvas] object prewarm failed:", error);
                    },
                );
            }
        };
        queueMicrotask(flush);
    }, [camera, gl, ref, revision, scene]);
}

export default function GameCanvas({ loader = false, children, glConfig, onCreated, raycaster, style, ...props }: GameCanvasProps) {
    return <>
        <Canvas
            style={{
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                WebkitTapHighlightColor: 'transparent',
                ...style,
            }}
            shadows={{ type: PCFShadowMap }}
            dpr={[1, 1.5]}
            raycaster={{ firstHitOnly: true, ...raycaster }}
            gl={async ({ canvas }) => {
                const renderer = new WebGPURenderer({
                    canvas: canvas as HTMLCanvasElement,
                    // @ts-expect-error futuristic
                    shadowMap: true,
                    antialias: true,
                    ...glConfig,
                });
                await renderer.init();
                return renderer;
            }}
            onCreated={onCreated}
            {...props}
        >
            <AssetRuntimeProvider>
                <AudioRuntimeProvider>
                    <Suspense>
                        {children}
                    </Suspense>
                </AudioRuntimeProvider>
            </AssetRuntimeProvider>

            {loader ? <Loader /> : null}
        </Canvas>
    </>;
}
