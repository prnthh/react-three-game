import { AssetBoundary } from '../assets/AssetBoundary.js';
import { memo, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { registerGameObjectOwner } from '../scene/gameObject.js';
import { notifyObjectChanged } from '../scene/objectChanges.js';
import type { Object3D } from "three";
import { getNodeUserData, type GameObject as GameObjectType } from "../../core/types.js";
import { usePrefabRenderNode, usePrefabStoreApi } from "./PrefabStoreContext.js";
import { NodeScope, PrefabEditorMode, RuntimeNodeIdPrefixContext, useGameObject, useScene, useNodeSelected, usePrefab } from "../scene/SceneContext.js";
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
    return <AssetBoundary subscribeToRetry={store.subscribe}><NodeTree {...props} /></AssetBoundary>;
});

function NodeTree({
    nodeId,
    onPointerEvent,
    isVisible = true,
    isEnabled = true,
}: RendererProps) {
    const [gameObject, childIds] = usePrefabRenderNode(nodeId);
    const lookup = useContext(ComponentLookupContext);
    const analyzedComponents = useMemo(
        () => gameObject ? analyzeNodeComponents(gameObject, lookup) : EMPTY_NODE_COMPONENTS,
        [gameObject, lookup],
    );
    if (!gameObject) return null;

    const nodeEnabled = isEnabled && !gameObject.disabled;
    const nodeVisible = isVisible && !gameObject.hidden && !gameObject.disabled;

    const childNodes = childIds.map(childId => <PrefabNode key={childId} nodeId={childId}
        onPointerEvent={onPointerEvent}
        isVisible={nodeVisible}
        isEnabled={nodeEnabled}
    />);
    const inner = renderNodeContent(analyzedComponents, childNodes, nodeEnabled);

    return <NodeGroup
        node={gameObject}
        childIds={childIds}
        analyzedComponents={analyzedComponents}
        onPointerEvent={onPointerEvent}
        nodeVisible={nodeVisible}
    >{inner}</NodeGroup>;
}

/** Mode changes update interaction and interested Views while preserving composed children. */
function NodeGroup({ node, childIds, analyzedComponents, onPointerEvent, nodeVisible, children }: {
    node: GameObjectType;
    childIds: string[];
    analyzedComponents: ReturnType<typeof analyzeNodeComponents>;
    onPointerEvent?: RendererProps['onPointerEvent'];
    nodeVisible: boolean;
    children: React.ReactNode;
}) {
    const nodeId = node.id;
    const scope = useContext(RuntimeNodeIdPrefixContext);
    const metadataProps = getNodeMetadataProps(node, scope);
    const registerRef = usePrefab().registerObject;
    const editMode = useScene().mode === PrefabEditorMode.Edit;
    const owner = useGameObject(nodeId);
    const isSelected = useNodeSelected(owner.id, editMode);
    const unregisterOwner = useRef<(() => void) | null>(null);
    const unregisterObject = useRef<(() => void) | null>(null);
    const groupRef = useRef<Object3D | null>(null);
    const { transform } = analyzedComponents;
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
    const primaryInteractionHandlers = useMemo(() => !editMode && analyzedComponents.clickEvent.enabled && onPointerEvent
        ? createNodeInteractionHandlers((eventType, event) => {
            event.stopPropagation();
            onPointerEvent(eventType, event, nodeId, groupRef.current, analyzedComponents.clickEvent.eventName);
        })
        : undefined, [editMode, analyzedComponents.clickEvent.enabled, analyzedComponents.clickEvent.eventName, onPointerEvent, nodeId]);

    return (
        <NodeScope
            nodeId={nodeId}
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
                {children}
            </group>
        </NodeScope>
    );
}

export interface RendererProps {
    nodeId: string;
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
        eventName: string | null,
    ) => void;
    isVisible?: boolean;
    isEnabled?: boolean;
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
        if (!enabled && !component.component.renderWhenDisabled) continue;
        const View = component.View;
        content = <View key={component.key} properties={component.properties} enabled={enabled}>{content}</View>;
    }
    return content;
}
