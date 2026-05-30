import { GameCanvas, PrefabRoot } from "react-three-game/viewer";
import { useState, useEffect } from "react";
import type { Prefab } from "react-three-game/viewer";
import { withBasePath, BASE_PATH } from "../basePath";

export default function DemoApp() {
    const [prefab, setPrefab] = useState<Prefab | null>(null);

    useEffect(() => {
        fetch(withBasePath('/prefabs/game-level.json')).then(r => r.json()).then(setPrefab);
    }, []);

    return (
        <div className="absolute inset-0 -z-1 h-full w-full">
            <GameCanvas>
                <ambientLight intensity={0.8} />
                {prefab && <PrefabRoot basePath={BASE_PATH} data={prefab} />}
            </GameCanvas>
        </div>
    );
} 
