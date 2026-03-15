import { Physics } from "@react-three/rapier";
import { GameCanvas, PrefabRoot } from "react-three-game";

import demoprefab from "../samples/game-level.json";

export default function DemoApp() {
    return (
        <div className="absolute top-0 w-screen h-screen -z-1">
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