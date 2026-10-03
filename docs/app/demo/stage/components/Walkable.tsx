import { useEffect } from "react";
import { useGameEvents, useGameObject, useNode, type Component } from "react-three-game/viewer";
import { MOVE_EVENT } from "../stage";

const Walkable: Component = {
    name: "Walkable",
    View: function WalkableView({ children }) {
        const events = useGameEvents();
        const object = useGameObject();
        const { editMode } = useNode();
        useEffect(() => {
            if (editMode) return;
            return events.on("click", payload => {
                if (payload.nodeId === object.id && payload.point) events.emit(MOVE_EVENT, { destination: payload.point });
            });
        }, [events, object, editMode]);
        return <>{children}</>;
    },
    properties: {},
};
export default Walkable;
