import { AssetBoundary } from '../assets/AssetBoundary.js';
import { memo, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { registerGameObjectOwner } from '../scene/gameObject.js';
import { notifyObjectChanged } from '../scene/objectChanges.js';
import type { Object3D } from "three";
import { getNodeUserData, type GameObject as GameObjectType } from "../../core/types.js";
import { usePrefabRenderNode, usePrefabStoreApi } from "./PrefabStoreContext.js";
import { NodeScope, RuntimeNodeIdPrefixContext, useGameObject } from "../scene/SceneContext.js";
import { useNodeSelected } from "../scene/SelectionRuntime.js";
import { createNodeInteractionHandlers, type NodeInteractionEvent, type NodeInteractionEventType } from "../scene/usePointerEvents.js";
import { analyzeNodeComponents, ComponentLookupContext, EMPTY_NODE_COMPONENTS } from "./nodePlan.js";

function getNodeMetadataProps(node: GameObjectType, scope: string) {
    const nodeName = node.name?.trim() ?? '';
    return {
        name: nodeName,
        userData: {
            prefabNodeId: node.id,
            prefabNodeScope: scope,
            ...(nodeName ? { prefabNodeName: nodeName } : {}),
            ...getNodeUserData(node),
        },
    };
}

export const PrefabNode = memo(function PrefabNode(props: RendererProps) {
    const store = usePrefabStoreApi();
    return <AssetBoundary subscribeToRetry={store.subscribe}><ResolvedPrefabNode {...props} /></AssetBoundary>;
});

function ResolvedPrefabNode({
    nodeId,
    registryVersion,
    onPointerEvent,
    registerRef,
    editMode,
    isVisible = true,
    isEnabled = true,
    preparing = false,
}: RendererProps) {
    const [gameObject, childIds] = usePrefabRenderNode(nodeId);
    const scope = useContext(RuntimeNodeIdPrefixContext);
    const lookup = useContext(ComponentLookupContext);
    const analyzedComponents = useMemo(
        () => gameObject ? analyzeNodeComponents(gameObject, lookup) : EMPTY_NODE_COMPONENTS,
        [registryVersion, gameObject, lookup],
    );
    const isSelected = useNodeSelected(nodeId, Boolean(editMode));
    const { transform } = analyzedComponents;

    const owner = useGameObject(nodeId);
    const unregisterOwner = useRef<(() => void) | null>(null);
    const unregisterObject = useRef<(() => void) | null>(null);
    const groupRef = useRef<Object3D | null>(null);
    useLayoutEffect(() => {
        if (groupRef.current) notifyObjectChanged(groupRef.current);
    }, [...transform.position, ...transform.rotation, ...transform.scale]);
    useLayoutEffect(() => {
        if (groupRef.current) notifyObjectChanged(groupRef.current, 'geometry');
    }, [childIds]);
    const handleGroupRef = useCallback((object: Object3D | null) => {
        unregisterOwner.current?.();
        unregisterOwner.current = object ? registerGameObjectOwner(object, owner) : null;
        unregisterObject.current?.();
        unregisterObject.current = null;
        groupRef.current = object;
        if (object) {
            const cleanup = registerRef(nodeId, object);
            unregisterObject.current = cleanup ?? (() => registerRef(nodeId, null));
        }
    }, [nodeId, registerRef, owner]);

    const primaryInteractionHandlers = !editMode && analyzedComponents.clickEvent.enabled && onPointerEvent
        ? createNodeInteractionHandlers((eventType, event) => {
            event.stopPropagation();
            onPointerEvent(eventType, event, nodeId, groupRef.current, analyzedComponents.clickEvent.eventName);
        })
        : undefined;

    if (!gameObject) return null;

    const nodeEnabled = isEnabled && !gameObject.disabled;
    const nodeVisible = (nodeEnabled || preparing) && isVisible && !gameObject.hidden && !gameObject.disabled;
    const metadataProps = getNodeMetadataProps(gameObject, scope);

    const childNodes = <ChildNodes childIds={childIds} registryVersion={registryVersion}
        onPointerEvent={onPointerEvent}
        registerRef={registerRef}
        editMode={editMode}
        isVisible={nodeVisible}
        isEnabled={nodeEnabled}
        preparing={preparing}
    />;
    const inner = renderNodeContent(analyzedComponents, childNodes, nodeEnabled);

    return (
        <NodeScope
            nodeId={nodeId}
            preparing={preparing}
            editMode={editMode}
            isSelected={isSelected}
            nodeInteractionHandlers={primaryInteractionHandlers}
        >
            <group
                ref={handleGroupRef}
                {...metadataProps}
                {...transform}
                {...primaryInteractionHandlers}
                visible={nodeVisible}
            >
                {inner}
            </group>
        </NodeScope>
    );
}

export interface RendererProps {
    registryVersion: number;
    nodeId: string;
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
        eventName: string | null,
    ) => void;
    registerRef: (id: string, obj: Object3D | null) => (() => void) | void;
    editMode?: boolean;
    isVisible?: boolean;
    isEnabled?: boolean;
    preparing?: boolean;
}

function ChildNodes({ childIds, ...props }: { childIds: string[] } & Omit<RendererProps, 'nodeId'>) {
    return childIds.map(childId =>
        <PrefabNode
            key={childId}
            nodeId={childId}
            {...props}
        />
    );
}

function renderNodeContent(
    analyzedComponents: ReturnType<typeof analyzeNodeComponents>,
    childNodes?: React.ReactNode,
    enabled = true,
) {
    const components = analyzedComponents.composition;
    let content = childNodes;
    for (let index = components.length - 1; index >= 0; index -= 1) {
        const component = components[index];
        if (!enabled && !component.renderWhenDisabled) continue;
        const View = component.View;
        content = <View key={component.key} properties={component.properties} enabled={enabled}>{content}</View>;
    }
    return content;
}
