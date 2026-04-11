import type { ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import { gameEvents } from '../GameEvents';
import { useEntityRuntime } from '../runtimeContext';
import { Component } from './ComponentRegistry';
import { FieldGroup, StringField } from './Input';
import type { ComponentData } from '../types';

type ClickProperties = {
    eventName?: string;
};

function ClickComponentEditor({ component, onUpdate }: { component: ComponentData; onUpdate: (newComp: any) => void }) {
    return (
        <FieldGroup>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
                Emits a game event in play mode when this entity is clicked.
            </div>
            <StringField
                name="eventName"
                label="Emit Event"
                values={component.properties}
                onChange={onUpdate}
                placeholder="click"
            />
        </FieldGroup>
    );
}

function ClickComponentView({ children, properties }: { children?: React.ReactNode; properties?: ClickProperties }) {
    const clickValid = useRef(false);
    const { editMode, nodeId } = useEntityRuntime();
    const eventName = properties?.eventName || 'click';

    const emitClick = (event: ThreeEvent<PointerEvent>) => {
        if (!nodeId) return;

        gameEvents.emit(eventName, {
            sourceEntityId: nodeId,
            point: [event.point.x, event.point.y, event.point.z],
            button: event.button,
            altKey: event.nativeEvent.altKey,
            ctrlKey: event.nativeEvent.ctrlKey,
            metaKey: event.nativeEvent.metaKey,
            shiftKey: event.nativeEvent.shiftKey,
        });
    };

    if (editMode) {
        return <>{children}</>;
    }

    return (
        <group
            onPointerDown={(event) => {
                event.stopPropagation();
                clickValid.current = true;
            }}
            onClick={(event) => {
                event.stopPropagation();
            }}
            onPointerMove={() => {
                clickValid.current = false;
            }}
            onPointerUp={(event) => {
                if (!clickValid.current) return;
                event.stopPropagation();
                emitClick(event);
                clickValid.current = false;
            }}
        >
            {children}
        </group>
    );
}

const ClickComponent: Component = {
    name: 'Click',
    Editor: ClickComponentEditor,
    View: ClickComponentView,
    defaultProperties: {
        eventName: 'click',
    },
};

export default ClickComponent;