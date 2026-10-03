import { useEffect } from "react";
import { useNode, type Component } from "react-three-game/viewer";
import { useGameDriver } from "./GameDriver";

const SceneRedirect: Component<{ scene?: string }> = {
    name: "SceneRedirect",
    View: function SceneRedirectView({ properties, children }) {
        const game = useGameDriver();
        const { editMode } = useNode();
        const changeScene = game?.changeScene;
        useEffect(() => {
            if (!editMode && properties.scene) void changeScene?.(properties.scene);
        }, [changeScene, editMode, properties.scene]);
        return <>{children}</>;
    },
    properties: { scene: { type: "string", default: "" } },
};
export default SceneRedirect;
