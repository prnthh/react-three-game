import { memo, useCallback, useMemo, useRef } from "react";
import type { Object3D } from "three";
import { getNodeUserData, type GameObject as GameObjectType } from "./types";
import { usePrefabRenderNode } from "./prefabStore";
import { NodeScope } from "./SceneContext";
import { useNodeSelected } from "./SelectionRuntime";
import { createNodeInteractionHandlers, type NodeInteractionEvent, type NodeInteractionEventType } from "./usePointerEvents";
import { analyzeNodeComponents, EMPTY_NODE_COMPONENTS } from "./nodePlan";

function getNodeMetadataProps(node: GameObjectType) {
    const nodeName = node.name?.trim() ?? '';
    return {
        name: nodeName,
        userData: {
            prefabNodeId: node.id,
            ...(nodeName ? { prefabNodeName: nodeName } : {}),
            ...getNodeUserData(node),
        },
    };
}

export const PrefabNode = memo(function PrefabNode({
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
    const analyzedComponents = useMemo(
        () => gameObject ? analyzeNodeComponents(gameObject) : EMPTY_NODE_COMPONENTS,
        [registryVersion, gameObject],
    );
    const isSelected = useNodeSelected(nodeId, Boolean(editMode));
    const { transform } = analyzedComponents;

    const groupRef = useRef<Object3D | null>(null);
    const handleGroupRef = useCallback((object: Object3D | null) => {
        groupRef.current = object;
        registerRef(nodeId, object);
    }, [nodeId, registerRef]);

    const primaryInteractionHandlers = !editMode && analyzedComponents.clickEvent.enabled && onPointerEvent
        ? createNodeInteractionHandlers((eventType, event) => {
            event.stopPropagation();
            onPointerEvent(eventType, event, nodeId, groupRef.current, analyzedComponents.clickEvent.eventName);
        })
        : undefined;

    if (!gameObject) return null;

    const nodeEnabled = isEnabled && !gameObject.disabled;
    const nodeVisible = (nodeEnabled || preparing) && isVisible && !gameObject.hidden && !gameObject.disabled;
    const metadataProps = getNodeMetadataProps(gameObject);

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
});

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
    registerRef: (id: string, obj: Object3D | null) => void;
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

