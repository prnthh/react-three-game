import { Canvas, extend, CanvasProps } from "@react-three/fiber";
import { WebGPURenderer, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial, PCFShadowMap } from "three/webgpu";
import { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.Nodes.js";
import type { ColorSpace, ShadowMapType, ToneMapping } from "three";
import { Loader } from "@react-three/drei";
import { useLayoutEffect, useRef, useState } from "react";
import { AssetRuntimeProvider } from "../tools/prefabeditor/assetRuntime";
import { AudioRuntimeProvider } from "../tools/prefabeditor/AudioRuntime";
import {
    claimComponentRegistrations,
    registerOwnedComponents,
    restoreComponentRegistrations,
    unregisterComponentRegistrations,
    type Component,
} from "../tools/prefabeditor/components/ComponentRegistry";
import { builtInComponents } from "../tools/prefabeditor/components";

extend({
    MeshBasicNodeMaterial: MeshBasicNodeMaterial,
    MeshStandardNodeMaterial: MeshStandardNodeMaterial,
    SpriteNodeMaterial: SpriteNodeMaterial,
});

export interface GameCanvasProps extends Omit<CanvasProps, 'children'> {
    loader?: boolean;
    children: React.ReactNode;
    glConfig?: WebGPURendererParameters;
    rendererConfig?: {
        outputColorSpace?: ColorSpace;
        toneMapping?: ToneMapping;
        toneMappingExposure?: number;
        shadowMapType?: ShadowMapType;
    };
}

export default function GameCanvas({ loader = false, children, glConfig, rendererConfig, onCreated, raycaster, style, ...props }: GameCanvasProps) {
    const owner = useRef(Symbol("game-components"));
    const ownedComponents = useRef<readonly Component<any>[] | null>(null);
    const [ready, setReady] = useState(false);

    useLayoutEffect(() => {
        registerOwnedComponents(owner.current, builtInComponents);
        if (ownedComponents.current === null) {
            ownedComponents.current = claimComponentRegistrations(owner.current);
        } else {
            restoreComponentRegistrations(owner.current, ownedComponents.current);
        }
        setReady(true);
        return () => {
            unregisterComponentRegistrations(owner.current);
        };
    }, []);

    if (!ready) return null;

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
            raycaster={raycaster}
            gl={async ({ canvas }) => {
                const renderer = new WebGPURenderer({
                    canvas: canvas as HTMLCanvasElement,
                    // @ts-expect-error futuristic
                    shadowMap: true,
                    antialias: true,
                    ...glConfig,
                });
                if (rendererConfig?.outputColorSpace !== undefined) renderer.outputColorSpace = rendererConfig.outputColorSpace;
                if (rendererConfig?.toneMapping !== undefined) renderer.toneMapping = rendererConfig.toneMapping;
                if (rendererConfig?.toneMappingExposure !== undefined) renderer.toneMappingExposure = Math.max(0, rendererConfig.toneMappingExposure);
                if (rendererConfig?.shadowMapType !== undefined) renderer.shadowMap.type = rendererConfig.shadowMapType;
                await renderer.init();
                return renderer;
            }}
            onCreated={onCreated}
            {...props}
        >
            <AssetRuntimeProvider>
                <AudioRuntimeProvider>
                    {children}
                </AudioRuntimeProvider>
            </AssetRuntimeProvider>

            {loader ? <Loader /> : null}
        </Canvas>
    </>;

}
