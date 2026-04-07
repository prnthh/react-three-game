import type { ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import { gameEvents } from '../GameEvents';
import { Component } from './ComponentRegistry';
import { FieldGroup } from './Input';

function ClickComponentEditor() {
    return (
        <FieldGroup>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
                Emits a click game event in play mode when this entity is clicked.
            </div>
        </FieldGroup>
    );
}

function ClickComponentView({ children, editMode, nodeId }: { children?: React.ReactNode; editMode?: boolean; nodeId?: string }) {
    const clickValid = useRef(false);

    const emitClick = (event: ThreeEvent<PointerEvent>) => {
        if (!nodeId) return;

        gameEvents.emit('click', {
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
    defaultProperties: {},
};

export default ClickComponent;