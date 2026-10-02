"use client";

import { GameCanvas, GameEventsProvider } from "react-three-game/viewer";
import "./registerComponents";
import StageGame from "./StageGame";

export default function StageDemo() {
    return <main className="relative h-screen w-screen overflow-hidden bg-black">
        <GameEventsProvider>
            <GameCanvas>
                <StageGame />
            </GameCanvas>
        </GameEventsProvider>
    </main>;
}
