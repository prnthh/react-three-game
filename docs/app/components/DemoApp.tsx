import { Physics } from "@react-three/rapier";
import { GameCanvas, PrefabRoot } from "react-three-game";

import demoprefab from "../samples/game-level.json";

export default function DemoApp() {
    return (
        <div className="absolute inset-0 -z-1 h-full w-full">
            <GameCanvas>
                <Physics>
                    <ambientLight intensity={0.8} />
                    <PrefabRoot
                        data={demoprefab} />
                </Physics>
            </GameCanvas>
        </div>
    );
} 